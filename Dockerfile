# syntax=docker/dockerfile:1

# --- build ---------------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# Manifests first, so a source-only change does not reinstall the world.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
RUN pnpm build

# --- runtime -------------------------------------------------------------
# One bundled file and the built pages: no node_modules in the image at all.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/packages/server/dist/index.js ./server/index.mjs
COPY --from=build /app/packages/web/dist ./web

USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
