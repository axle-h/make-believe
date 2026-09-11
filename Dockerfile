# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages

# There is no .git in here, so CI passes the commit in for /version; without it the build uses a timestamp.
ARG BUILD_VERSION=""
ENV BUILD_VERSION=$BUILD_VERSION
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# The bundle is ESM and lands as `.mjs`: with no package.json here a `.js` file would be parsed as CommonJS.
COPY --from=build /app/packages/server/dist/index.js ./server/index.mjs
COPY --from=build /app/packages/web/dist ./web

USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
