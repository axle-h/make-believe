# MAKE believe

A party game for the living room, played on the TV with phones as controllers. The TV runs the game (the **host**), and each player joins from an Android phone or a laptop browser (a **player**) by scanning a QR code. In-game characters are called **blobs**: move your blob around the screen, give it a name, draw its skin on your phone, and make it talk with speech bubbles.

Everything ships as one Node process: it serves the host page at `/host/`, the player page at `/`, and relays WebSocket messages between them at `/ws`. The host owns all game state; phones are dumb controllers. There is only ever one world per deployment; the 4-letter code shown on the TV just stops stale phones joining tonight's session.

The full design brief for this project lives in [`CLAUDE.md`](./CLAUDE.md). The phased implementation plan and its working state live in [`docs/`](./docs/README.md).

## Prerequisites

- Node 22 (`node --version`)
- pnpm via corepack: `corepack enable` (pnpm workspaces are used; do not use npm or yarn)
- Docker, only if you want to build the container
- Playwright browsers, only for the end-to-end tests: `pnpm exec playwright install`

## Build and run

```sh
pnpm install          # install all workspace packages
pnpm dev              # dev mode: Vite on :5173, server on :3000, hot reload on both
```

In dev mode open `http://localhost:5173/host/` on the TV and `http://<your-lan-ip>:5173/` on each phone.

```sh
pnpm build            # vite build for the web pages, esbuild bundle for the server
pnpm start            # serve the built app on :3000 (same as the container)
```

In production mode open `http://<your-lan-ip>:3000/host/` on the TV and `http://<your-lan-ip>:3000/` on phones. The port can be changed with the `PORT` environment variable.

**Open the TV by LAN address, never `localhost`.** The QR code on the TV is built from the address that page was opened with, so a TV on `localhost` hands every phone a link back to itself.

While the game is running, the keys `P`, `T`, `D` and `L` on the TV switch the phones between the joystick, the text box, the drawing pad and the lobby. The current phase is shown along the bottom of the screen.

Only one TV at a time: opening the host page a second time takes the world over, and the first TV says so and stands down.

## Test

```sh
pnpm typecheck        # tsc across all packages
pnpm lint
pnpm test             # unit and integration tests (vitest), fast
pnpm test:e2e         # Playwright, runs against the built app, slower
```

## Container

```sh
docker build -t make-believe .
docker run --rm -p 3000:3000 make-believe
```

Kubernetes manifests for a single-replica deployment are in `k8s/`. One deployment serves exactly one world, held in memory, so never run more than one replica.

## Repo layout

```
packages/shared   message schemas (zod) and room-code helpers, shared by web and server
packages/web      one Vite project with two pages: player (/) and host (/host/)
packages/server   Node http + ws relay, serves the built web app
e2e/              Playwright tests
androidtv/        Android TV WebView wrapper that puts the host page on the TV home screen
docs/             implementation plan and working state
k8s/              deployment and service manifests
```
