# MAKE believe

A party game for the living room: the TV runs the world (the **host**) and each child drives a
**blob** from an Android phone or a laptop browser (a **player**) — name it, draw its skin, make it
talk, and play the tasks the world asks for. One Node process serves the host page at `/host/`, the
player page at `/` and a WebSocket relay at `/ws`. The host owns all game state; phones are dumb.

## Run

Node 22 and pnpm via `corepack enable`; Playwright browsers (`pnpm exec playwright install`) only
for e2e.

```sh
pnpm install
pnpm dev              # Vite on :5173, server on :3000, hot reload on both
pnpm build && pnpm start   # the built app on :3000 (PORT to change), same as the container
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e         # Playwright against the built app
```

Open the TV at `http://<lan-ip>:5173/host/` (or `:3000` built), never `localhost`: the QR code is
built from the page's own address. Phones scan it once; after that, opening the app is joining.

## Deployed

<https://believe.ax-h.com/host/> on the TV, <https://believe.ax-h.com/> on phones. The image
`ghcr.io/axle-h/make-believe:latest` is built and smoke-tested by GitHub Actions on every push to
`main`; one replica, always. See [`k8s/README.md`](k8s/README.md). The TV app is a Kotlin WebView
wrapper, see [`androidtv/README.md`](androidtv/README.md).

## Layout

```
packages/shared   message schemas (zod), session codes, glyphs, themes
packages/web      one Vite project, two pages: player (/) and host (/host/)
packages/server   node:http + ws relay, serves the built web app
e2e/              Playwright tests
androidtv/        Android TV WebView wrapper
k8s/              deployment, service, ingress
```
