---
phase: 6
title: QR, reconnect, e2e
status: not-started
updated: 2026-09-01
---

# Phase 6 — QR code, reconnect handling, end-to-end tests

## Goal

Joining is as easy as scanning the TV. Dropped connections on either side recover without anyone restarting anything. A Playwright suite proves the whole thing works against the built app.

## Read first

`CLAUDE.md` sections: Testing (e2e), Player notes (Wake Lock), Relay semantics.

## Tasks

### QR code

- [ ] Add one QR library to `packages/web` (record which in `DECISIONS.md`). Host page renders a QR for `http://<origin>/?room=ABCD`. The origin must be the LAN address the phones can reach, not `localhost`; use `window.location.origin` and document that the TV must be opened by LAN IP.
- [ ] Player page pre-fills the room code from `?room=` and focuses the name field.

### Reconnect

- [ ] Player ws client: exponential backoff reconnect, re-sends `join` with the stored `playerId` and name on reconnect, shows a small "reconnecting" indicator.
- [ ] Host ws client: reconnects with the same room code (keep it in `sessionStorage` so a TV refresh reuses it); on reconnect the relay's "new host replaces current" rule applies and existing players carry on. Players who were connected re-`join` automatically because the relay sends them `phase: lobby` on host loss and the player re-joins when the host is back; verify this path end to end and fix whatever it needs.
- [ ] Wake Lock on the player page, requested on join, released on leave, silently degrades when unavailable (it will be, without HTTPS).
- [ ] Relay: a test for host replacement while players are attached, asserting players are not dropped.

### Playwright e2e (`/e2e`)

- [ ] `playwright.config.ts` at the root with `webServer` running `pnpm build && pnpm start` (or just `pnpm start` if `dist` is fresh; be explicit) and `baseURL` on :3000.
- [ ] One spec, as described in `CLAUDE.md` Testing, e2e: host context reads the room code from the DOM; two player contexts join with names; assert names on host via `window.__game`; joystick drag on player 1 moves only player 1; text from player 2 shows a bubble; a drawing round-trips (draw a few strokes on the canvas, Done, assert the model's skin key changed).
- [ ] `pnpm test:e2e` runs it. It is not part of `pnpm test`.
- [ ] README's "Test" section already documents `pnpm test:e2e` and the browser install; confirm it is accurate.

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Manual check: scan the QR from a phone and join; kill the host tab and reopen it; phones recover.

## Handoff

- **State:** not started.
- **Next step:** add the QR code to the host page.
- **Known issues:** none.
