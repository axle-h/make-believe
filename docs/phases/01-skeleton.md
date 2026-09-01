---
phase: 1
title: Skeleton
status: not-started
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

- [ ] `pnpm-workspace.yaml` listing `packages/*`.
- [ ] Root `package.json` (private) with scripts `dev`, `build`, `start`, `test`, `test:e2e`, `lint`, `typecheck`. `dev` runs web and server in parallel (`pnpm -r --parallel dev` is enough). `test:e2e` may be a placeholder that prints "not yet" until phase 6.
- [ ] `tsconfig.base.json` (strict, ES2022, `moduleResolution: bundler`) extended by each package.
- [ ] `.gitignore` covering `node_modules`, `dist`, `.idea` (already present), Playwright output.
- [ ] Root `vitest.workspace.ts` pointing at the three packages.
- [ ] `pnpm install` succeeds and produces `pnpm-lock.yaml`.

### packages/shared

- [ ] `src/messages.ts`: zod schemas for every message in the protocol (`join`, `input`, `drawing`, `text`, `assigned`, `phase`, `left`), a discriminated union for player-to-host and host-to-player, and derived TS types. Caps: `text` at 60 chars, `png` at a sensible byte limit (decide and record in `DECISIONS.md`), `dx`/`dy` in -1..1.
- [ ] `src/roomCode.ts`: `generateRoomCode()` returning 4 chars from a charset without `0/O/1/I`, and `isValidRoomCode()`.
- [ ] `src/index.ts` re-exporting both.
- [ ] Tests: each schema accepts a valid message and rejects a malformed and an oversize one; room code length, charset, validity check.
- [ ] Only runtime dependency is `zod`.

### packages/server

- [ ] `src/relay.ts`: `createRelay()` with no I/O. **Single world:** one host slot, one current room code, a `Map` of players keyed by `playerId`. No `Map` of rooms. API along the lines of `attachHost(code, send)`, `attachPlayer(code, playerId, send)`, `detach(...)`, `route(from, msg)`. Semantics exactly as `CLAUDE.md` "Relay semantics": a new host replaces the current one and sets the current code; player messages forwarded to host tagged with `playerId`; host messages carry `to` and fan out on `'*'`; host disconnect tears down the world and sends `phase: lobby` to players; player disconnect sends `left` to host; a player whose code does not match the current one, or who connects before any host, is rejected.
- [ ] `src/relay.test.ts` covering each of those semantics (see `CLAUDE.md` Testing, server, unit list).
- [ ] `src/index.ts`: `node:http` server, `GET /healthz` 200, `Upgrade` on `/ws` handled by `ws`, everything else served by `sirv` from `../web/dist` with `single: false`. Parses `role`, `room`, `playerId` from the query string. Validates every inbound message with the `shared` schemas and drops invalid ones. `PORT` env, default 3000, listens on `0.0.0.0`.
- [ ] `src/index.test.ts`: one integration test, real server on port 0, real `ws` clients as host plus two players, asserts forwarding and `/healthz`.
- [ ] Scripts: `dev` = `tsx watch src/index.ts`, `build` = esbuild bundle to `dist/index.js`, `start` = `node dist/index.js`.

### packages/web

- [ ] `vite.config.ts`: multi-page `rollupOptions.input` for `index.html` and `host/index.html`; `server.host: true`; `server.proxy['/ws']` to `ws://localhost:3000` with `ws: true`.
- [ ] `src/lib/ws.ts`: small WebSocket client helper shared by both pages (connect with role/room/playerId, JSON send, parse inbound with `shared` schemas, basic reconnect with backoff).
- [ ] `host/index.html` + `src/host/main.ts`: on load, generate a room code (a session key for the single world), connect as host, show the code in large text, draw a coloured square per joined player on a plain `<canvas>`. On `input` apply velocity; clamp to canvas bounds. On `left` remove the square. Send `assigned` with a colour and slot on join.
- [ ] `index.html` + `src/player/main.ts`: read room code from `?room=` or a bare text input, generate or load `playerId` from localStorage, connect as player, send `join` (name can be a placeholder such as the slot colour for now), then show a joystick.
- [ ] `src/player/joystick.ts`: pure functions for pointer position to normalised `{dx, dy}` with dead zone and unit-circle clamp, plus a throttle (send on change, max ~30/sec) over an injectable clock. Both unit-tested.
- [ ] Phaser is **not** added in this phase.

### Container

- [ ] Multi-stage `Dockerfile` as specified in `CLAUDE.md` Deployment. Runtime image has no `node_modules`, runs as `node`, exposes 3000.

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

- **State:** nothing built yet.
- **Next step:** create the workspace files and get `pnpm install` passing, then `shared`.
- **Known issues:** none.
