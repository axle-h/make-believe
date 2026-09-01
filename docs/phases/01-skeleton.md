---
phase: 1
title: Skeleton
status: done
updated: 2026-09-01
---

# Phase 1 — Skeleton

## Goal

The whole pipeline exists and runs end to end with the simplest possible content: a pnpm workspace with three packages, validated message schemas, a tested relay server, and a single Vite build producing both pages. The host page shows the room code and one coloured square per connected player on a plain `<canvas>`. The player page has a joystick that moves your square. `pnpm dev`, `pnpm build && pnpm start`, and the Dockerfile all work.

No Phaser, no names, no drawing, no text in this phase. `CLAUDE.md` says milestone 1 comes before anything else, including its tests.

## Read first

`CLAUDE.md` sections: Architecture, Decisions already made, Repo layout, Message protocol, Server, Dev workflow, Testing (shared and server parts), Deployment.

## Tasks

### Workspace

- [x] `pnpm-workspace.yaml` listing `packages/*`. Also carries `allowBuilds: { esbuild: true }`, without which pnpm 11 refuses the install with `ERR_PNPM_IGNORED_BUILDS`.
- [x] Root `package.json` (private) with scripts `dev`, `build`, `start`, `test`, `test:e2e`, `lint`, `typecheck`. `dev` runs web and server in parallel (`pnpm -r --parallel dev` is enough). `test:e2e` may be a placeholder that prints "not yet" until phase 6.
- [x] `tsconfig.base.json` (strict, ES2022, `moduleResolution: bundler`) extended by each package.
- [x] `.gitignore` covering `node_modules`, `dist`, `.idea` (already present), Playwright output.
- [x] Root `vitest.workspace.ts` pointing at the three packages. (Vitest 4 removed workspace files; this is `vitest.config.ts` with `test.projects` instead — see D-004.)
- [x] `pnpm install` succeeds and produces `pnpm-lock.yaml`.
- [x] Added: a linter. `pnpm lint` runs `oxlint` with `.oxlintrc.json` — Alex picked it over eslint/biome (D-006).

### packages/shared

- [x] `src/messages.ts`: zod schemas for every message in the protocol (`join`, `input`, `drawing`, `text`, `assigned`, `phase`, `left`), a discriminated union for player-to-host and host-to-player, and derived TS types. Caps: `text` at 60 chars, `png` at a sensible byte limit (decide and record in `DECISIONS.md`), `dx`/`dy` in -1..1. Also exports `HostOutboundMessageSchema` (a host message plus its `to`) and `ServerToHostMessageSchema` (forwarded player messages plus `left`), and a `parseMessage` helper.
- [x] `src/roomCode.ts`: `generateRoomCode()` returning 4 chars from a charset without `0/O/1/I`, and `isValidRoomCode()`. Plus `normaliseRoomCode()` for what a phone keyboard produces.
- [x] `src/index.ts` re-exporting both.
- [x] Tests: each schema accepts a valid message and rejects a malformed and an oversize one; room code length, charset, validity check.
- [x] Only runtime dependency is `zod`.

### packages/server

- [x] `src/relay.ts`: `createRelay()` with no I/O. **Single world:** one host slot, one current room code, a `Map` of players keyed by `playerId`. No `Map` of rooms. API is `attachHost(code, connection)`, `attachPlayer(code, playerId, connection)`, `detachHost(connection)`, `detachPlayer(playerId, connection)`, `routeFromPlayer(playerId, msg)`, `routeFromHost(msg)`, where a `Connection` is `{ send, close }` so the relay can hang up without touching a socket. Semantics exactly as `CLAUDE.md` "Relay semantics".
- [x] `src/relay.test.ts` covering each of those semantics (see `CLAUDE.md` Testing, server, unit list), plus stale-socket cases: a replaced host or player closing later must not tear down its replacement.
- [x] `src/index.ts`: `node:http` server, `GET /healthz` 200, `Upgrade` on `/ws` handled by `ws`, everything else served by `sirv` from `../web/dist` with `single: false`. Parses `role`, `room`, `playerId` from the query string. Validates every inbound message with the `shared` schemas and drops invalid ones. `PORT` env, default 3000, listens on `0.0.0.0`. (Split: `src/server.ts` builds and starts it, `src/index.ts` is the four-line entry point, so the test can start a real server without a side effect on import.)
- [x] `src/index.test.ts`: one integration test, real server on port 0, real `ws` clients as host plus two players, asserts forwarding and `/healthz`. Three cases: full relay round trip, a stale room code, and hang-ups on a bad role/code/playerId.
- [x] Scripts: `dev` = `tsx watch src/index.ts`, `build` = esbuild bundle to `dist/index.js`, `start` = `node dist/index.js`. The bundle is ESM with a `createRequire` banner (D-005).

### packages/web

- [x] `vite.config.ts`: multi-page `rollupOptions.input` for `index.html` and `host/index.html`; `server.host: true`; `server.proxy['/ws']` to `ws://localhost:3000` with `ws: true`.
- [x] `src/lib/ws.ts`: small WebSocket client helper shared by both pages (connect with role/room/playerId, JSON send, parse inbound with `shared` schemas, basic reconnect with backoff). Close codes 4000-4099 mean "do not come back".
- [x] `host/index.html` + `src/host/main.ts`: on load, generate a room code (a session key for the single world), connect as host, show the code in large text, draw a coloured square per joined player on a plain `<canvas>`. On `input` apply velocity; clamp to canvas bounds. On `left` remove the square. Send `assigned` with a colour and slot on join.
- [x] `index.html` + `src/player/main.ts`: read room code from `?room=` or a bare text input, generate or load `playerId` from localStorage, connect as player, send `join` (name is the placeholder `Blob` until phase 2), then show a joystick.
- [x] `src/player/joystick.ts`: pure functions for pointer position to normalised `{dx, dy}` with dead zone and unit-circle clamp, plus a throttle (send on change, max ~30/sec) over an injectable clock. Both unit-tested.
- [x] Added: the host page exposes `window.__game` (blobs + world size). It is the test seam phase 6 needs, and it is what made the manual check below verifiable (D-007).
- [x] Phaser is **not** added in this phase.

### Container

- [x] Multi-stage `Dockerfile` as specified in `CLAUDE.md` Deployment. Runtime image has no `node_modules`, runs as `node`, exposes 3000. The bundled server lands at `server/index.mjs` (D-005); image is 55 MB.

## Acceptance

All of these must pass from a fresh clone:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build && (pnpm start & sleep 2; curl -fsS localhost:3000/healthz; curl -fsS localhost:3000/host/ | grep -q '<canvas'; kill %1)
docker build -t make-believe . && docker run --rm -d -p 3000:3000 --name mb make-believe && sleep 2 && curl -fsS localhost:3000/healthz && docker rm -f mb
```

Manual check (do it, and note the result in the Handoff): `pnpm dev`, open `/host/` in one tab and `/` in two others with the room code, confirm two squares appear and each joystick moves only its own square.

## Handoff

- **State:** phase 1 is complete and every acceptance command above passes. `pnpm test` is 59 tests over 5 files (shared schemas and room codes, relay units, server integration over real sockets, joystick maths and throttling). The manual check was done in Chrome against `pnpm dev`: host at `/host/` showing the code, two player tabs joined (second one via `127.0.0.1` so it got its own `localStorage` playerId), each pad moved only its own square, releasing a pad stopped that square, and closing a player tab removed its square from the TV.
- **Next step:** phase 2 — the join screen with name entry, and a name label above each square.
- **Known issues:**
  - A host reload always mints a new room code, so every phone has to retype it. That is by design until phase 6 (reconnect), but it is the roughest edge in day-to-day use, and Vite's HMR triggers it on every host-side edit.
  - The player bundle carries zod (~85 kB raw, 24 kB gzipped) because the phone parses inbound messages with the shared schemas. Fine for now; worth revisiting if the phone bundle ever matters.
  - A browser tab that is not visible stops `requestAnimationFrame`, so a backgrounded host stops ticking and a backgrounded phone stops sending while a pad is held. Correct behaviour for a TV and a phone in hand; it does mean automated checks must keep the pages in the foreground.
