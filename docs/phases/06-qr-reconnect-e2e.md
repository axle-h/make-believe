---
phase: 6
title: QR, reconnect, e2e
status: done
updated: 2026-09-02
---

# Phase 6 — QR code, reconnect handling, end-to-end tests

## Goal

Joining is as easy as scanning the TV. Dropped connections on either side recover without anyone restarting anything. A Playwright suite proves the whole thing works against the built app.

## Read first

`CLAUDE.md` sections: Testing (e2e), Player notes (Wake Lock), Relay semantics.

## Tasks

### QR code

- [x] Add one QR library to `packages/web` (record which in `DECISIONS.md`). Host page renders a QR for `http://<origin>/?room=ABCD`. The origin must be the LAN address the phones can reach, not `localhost`; use `window.location.origin` and document that the TV must be opened by LAN IP.
- [x] Player page pre-fills the room code from `?room=` and focuses the name field.

### Reconnect

- [x] Player ws client: exponential backoff reconnect, re-sends `join` with the stored `playerId` and name on reconnect, shows a small "reconnecting" indicator.
- [x] Host ws client: reconnects with the same room code (keep it in `sessionStorage` so a TV refresh reuses it); on reconnect the relay's "new host replaces current" rule applies and existing players carry on. Players who were connected re-`join` automatically because the relay sends them `phase: lobby` on host loss and the player re-joins when the host is back; verify this path end to end and fix whatever it needs.
- [x] Wake Lock on the player page, requested on join, released on leave, silently degrades when unavailable (it will be, without HTTPS).
- [x] Relay: a test for host replacement while players are attached, asserting players are not dropped.

### Playwright e2e (`/e2e`)

- [x] `playwright.config.ts` at the root with `webServer` running `pnpm build && pnpm start` (or just `pnpm start` if `dist` is fresh; be explicit) and `baseURL` on :3000.
- [x] One spec, as described in `CLAUDE.md` Testing, e2e: host context reads the room code from the DOM; two player contexts join with names; assert names on host via `window.__game`; joystick drag on player 1 moves only player 1; text from player 2 shows a bubble; a drawing round-trips (draw a few strokes on the canvas, Done, assert the model's skin key changed).
- [x] `pnpm test:e2e` runs it. It is not part of `pnpm test`.
- [x] README's "Test" section already documents `pnpm test:e2e` and the browser install; confirm it is accurate.

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Manual check: scan the QR from a phone and join; kill the host tab and reopen it; phones recover.

## Handoff

- **State:** done. The TV shows a QR code beside the room code, built from the page's own origin, and keeps its code in `sessionStorage` so a reload reuses it. The relay keeps the phones attached when a TV reconnects on the same code, and a waiting phone knocks every two seconds until the TV answers (D-021), so a TV reload puts everyone back within a couple of seconds with nothing retyped. A replaced TV is told why and stands down instead of fighting for the world (D-020). Phones show a "Reconnecting…" badge and hold a Wake Lock where the browser allows one. `pnpm test:e2e` runs three Playwright tests against `pnpm build && pnpm start`, passing repeatedly.
- **Next step:** phase 7 — the k3s manifests and the first deploy. That phase needs Alex's cluster and a GHCR push, so it is where an agent should stop and check in.
- **Known issues:** Wake Lock cannot be exercised over plain http on the LAN (it needs a secure context) — it degrades silently and phase 8's HTTPS is what turns it on. Everything on a phone (the mobile keyboard, drawing with a finger, the QR scan itself) is still only proven in a desktop browser.
