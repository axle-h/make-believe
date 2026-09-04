# MAKE believe

A party game for the living room, played on the TV with phones as controllers. The TV runs the game (the **host**), and each player joins from an Android phone or a laptop browser (a **player**) by scanning a QR code. In-game characters are called **blobs**: move your blob around the screen, give it a name, draw its skin on your phone, and make it talk with speech bubbles.

Everything ships as one Node process: it serves the host page at `/host/`, the player page at `/`, and relays WebSocket messages between them at `/ws`. The host owns all game state; phones are dumb controllers. There is only ever one world per deployment. A 4-letter session code names the world the TV is currently running, but it appears in no URL and nobody ever reads it: the relay hands it out on connect, and a phone holding an older one comes back in as a new player.

The full design brief lives in [`CLAUDE.md`](./CLAUDE.md). All of it is built: what each piece does is described by the code and its comments, and why it is that way is in the commit history.

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

**Running it locally, open the TV by LAN address, never `localhost`.** The QR code on the TV is built from the address that page was opened with, so a TV on `localhost` hands every phone a link back to itself. The deployed app has no such problem — see below.

The TV takes no input at all — it is a window onto the world and the phones run everything. There are no rounds: every phone can drive, say something and redraw its blob whenever it likes, or quit — behind the ☰ menu, since it is the one thing that undoes anything — and start again as somebody new.

Only one TV at a time: opening the host page a second time takes the world over, and the first TV says so and stands down.

## Playing it

It is deployed at **<https://believe.ax-h.com>** — open `/host/` on the TV and scan
the QR code with each phone the first time.

```
TV:      https://believe.ax-h.com/host/
phones:  https://believe.ax-h.com/ — the QR code on the TV is just this address
```

The QR code carries the address and nothing else, so it is only ever needed
once. A phone that has been added to the home screen opens fullscreen straight
onto its joystick: it remembers the name it played under, and which world it has
reached is settled on the connection. If the TV has been restarted since, the
blob is a new one under the same name, with the same picture put back up — the
phone sorts that out on its own and there is nothing to scan, type or press.

One namespace in k3s, one pod, one world. See [`k8s/README.md`](./k8s/README.md).

## On the TV

There is a small Android TV app in [`androidtv/`](./androidtv): a native Kotlin
wrapper around one fullscreen WebView pointed at the deployed host page, so the
TV gets every update without reinstalling anything. It puts MAKE believe on the
Fire TV home screen with its own banner, keeps the screen awake, and retries by
itself when the server is not up yet.

**Building it, signing it and installing it onto the stick over `adb` is all in
[`androidtv/README.md`](./androidtv/README.md)**, along with how to read the host
page's console off the TV with `adb logcat`. It needs the Android SDK, so it is
deliberately outside `pnpm build` and `pnpm test`; the game itself is deployed to
k3s exactly as before, and a deploy *is* the TV's update.

## Test

```sh
pnpm typecheck        # tsc across all packages
pnpm lint
pnpm test             # unit and integration tests (vitest), fast
pnpm test:e2e         # Playwright, runs against the built app, slower
```

## Container

The published image is `ghcr.io/axle-h/make-believe:latest`, built and smoke-tested by GitHub Actions on every push to `main` — there is no need to build it by hand. To do so anyway:

```sh
docker build -t make-believe .
docker run --rm -p 3000:3000 make-believe
```

Kubernetes manifests for a single-replica deployment are in `k8s/`. One deployment serves exactly one world, held in memory, so never run more than one replica.

## Repo layout

```
packages/shared   message schemas (zod) and session-code helpers, shared by web and server
packages/web      one Vite project with two pages: player (/) and host (/host/)
packages/server   Node http + ws relay, serves the built web app
e2e/              Playwright tests
androidtv/        Android TV app: a Kotlin WebView wrapper around the host page, and how to install it
.github/          CI: tests on every push, and the image build that publishes to ghcr.io
k8s/              deployment, service, ingress and TLS manifests
```
