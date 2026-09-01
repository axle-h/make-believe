# Decisions made during implementation

Numbered, append-only. Record choices that `CLAUDE.md` does not already settle and that a later session might otherwise reopen. Do not re-record decisions already listed in `CLAUDE.md` under "Decisions already made".

Format:

```
## D-0NN — <short title> (2026-09-01, phase N)
**Context:** why a choice was needed.
**Decision:** what was chosen.
**Consequences:** what this rules in or out later.
```

## D-001 — Public hostname is `believe.ax-h.com` (2026-09-01, planning)
**Context:** the app needs a subdomain of `ax-h.com` for TLS and the PWA. `make-believe.ax-h.com` was the other candidate.
**Decision:** Alex chose `believe.ax-h.com`. Everything else that needs a name (namespace, image, deployment, service, TLS secret, middleware prefix) uses `make-believe`.
**Consequences:** the QR code, the Fire TV wrapper's `HOST_URL`, and the README all point at `https://believe.ax-h.com`. Renaming later would mean a new certificate and a new ddns entry.

## D-002 — TV wrapper lives in `androidtv/`, minSdk 28 (2026-09-01, planning)
**Context:** the wrapper was first planned as `firetv/`, but nothing in it is Fire-specific: leanback launcher, banner, WebView, ADB install and remote keycodes are all standard Android TV.
**Decision:** the folder is `androidtv/` and the app is a plain Android TV app. Target device is Alex's Fire TV Stick 4K Max 1st gen (AFTKA, Fire OS 7, Android 9, API 28), so `minSdk = 28`.
**Consequences:** any Android TV box on API 28+ can run it. Fire OS 5 sticks are not supported and nobody should lower the build target for them.

## D-003 — Message size caps (2026-09-01, phase 1)
**Context:** the brief caps `text` at ~60 characters but leaves the `png` and name limits open, and the server has to reject oversize payloads rather than relay them.
**Decision:** `text` 60 characters, blob name 16 characters, and a drawing `png` data URL capped at 262,144 characters (256 KiB) which must start with `data:image/png;base64,`. A 256x256 doodle is far below that; a photo-sized paste is not.
**Consequences:** the phone must keep its drawing canvas small (phase 5) or the server will drop the message. Raising the cap means changing `MAX_PNG_LENGTH` in `shared` only.

## D-004 — Vitest projects, not a workspace file (2026-09-01, phase 1)
**Context:** the phase 1 checklist asked for `vitest.workspace.ts`, but Vitest 4 removed workspace files in favour of `test.projects`.
**Decision:** the root config is `vitest.config.ts` with one inline project per package, each pinned to `environment: 'node'` and `src/**/*.test.ts`.
**Consequences:** `pnpm test` and `pnpm vitest run --project server` work as the plan assumed. The web project deliberately does not load `packages/web/vite.config.ts`, so the multi-page build config cannot affect tests.

## D-005 — The server bundle is ESM with a `createRequire` banner (2026-09-01, phase 1)
**Context:** esbuild bundling `ws` into an ESM file produces `Dynamic require of "events" is not supported` at startup, because `ws` uses CommonJS `require` internally.
**Decision:** keep the ESM bundle and prepend `--banner:js` defining `require` via `node:module`'s `createRequire`. In the container the bundle is copied to `server/index.mjs` (the runtime image has no `package.json`, so a `.js` file would be parsed as CommonJS) and `CMD` runs that.
**Consequences:** one bundled file, no `node_modules` in the image, and `ws`'s optional native accelerators stay absent and harmless. Anything added to the server that does a genuinely dynamic `require` will now resolve at runtime instead of failing at build time — worth remembering if a dependency ever needs bundling attention.

## D-006 — oxlint is the linter (2026-09-01, phase 1)
**Context:** phase 1's acceptance list includes `pnpm lint`, but `CLAUDE.md`'s dependency allowlist names no linter.
**Decision:** Alex chose oxlint over eslint + typescript-eslint and over Biome. One dev dependency at the root, `.oxlintrc.json` enabling the correctness, suspicious and perf categories, `pnpm lint` = `oxlint`.
**Consequences:** no formatter is in play, so formatting stays a matter of habit. Type-aware rules are not available; `pnpm typecheck` covers that ground.

## D-007 — The host page exposes `window.__game` (2026-09-01, phase 1)
**Context:** phase 6 plans a `window.__game` test hook for the Playwright suite because screenshot-diffing Phaser is not viable. Verifying phase 1's own manual check (one pad moves only its own square) needed the same seam.
**Decision:** the host page publishes `{ blobs, world }` on `window.__game` from the start, as a read-only view of the live state.
**Consequences:** the e2e suite has its hook already. Phase 3 must keep it pointing at the pure game model when the model replaces the ad-hoc `blobs` map, or the phase 6 tests will need rewriting.

## D-008 — A new host means every player rejoins (2026-09-01, phase 1)
**Context:** `CLAUDE.md` says a new host connection replaces the current one, and that a host disconnect tears the world down. It does not say what happens to the phones still holding sockets.
**Decision:** attaching a host, or losing one, sends every registered player `{ type: 'phase', value: 'lobby' }`, closes their socket and forgets them. The relay never carries players across a host change.
**Consequences:** a TV refresh mints a new code and sends every phone back to the code screen — correct while the host keeps no state across reloads, and the thing phase 6's reconnect work has to soften.

## D-009 — A blob waits for a phone that has gone (2026-09-01, phase 2)
**Context:** phase 2 asks that a phone refresh reattach to the same square with the same name. A refresh drops the WebSocket, so the relay sends the host `left`, and the host deleted the blob on the spot — the rejoining phone then got a brand new blob at the spawn point, which is not "the same square".
**Decision:** `left` marks the blob `away` instead of deleting it. It stays on the TV at 30% opacity, stopped dead, holding its slot, colour, name and position. A `join` from the same `playerId` revives it. `tick` forgets an away blob after `AWAY_TIMEOUT_MS`, 30 seconds, which frees its slot and colour.
**Consequences:** a refresh, a dropped connection or a walk out of wifi range is a non-event for up to 30 seconds. A child who puts the phone down leaves a faded square for half a minute. Phase 3 moves position into Phaser bodies, so `away` will have to stop a body rather than just skip a branch in a loop.

## D-010 — The phone remembers the last room code (2026-09-01, phase 2)
**Context:** the brief says to remember the name in localStorage but says nothing about the code. With only the name remembered, every refresh made a child retype the code from the TV, which makes "refreshing a phone keeps its square" true in the model but tedious in the hand.
**Decision:** remember the code as well, under `make-believe.room`. On load the code comes from `?room=` if present, else from storage; if that plus the remembered name is enough to join, the page joins immediately without showing the form.
**Consequences:** a refresh asks for nothing at all. A stale code auto-joins and is turned away, which is fine because the phone is told why (D-011) and lands back on the form with a message. The QR link in phase 6 still wins over storage.

## D-011 — The relay leaves a rejected player socket open (2026-09-01, phase 2)
**Context:** `attachPlayer` sent the lobby message and closed the socket itself, then `server.ts` called `ws.close(4001, reason)` on the already-closing socket. The second close was ignored, so the phone saw close code 1005 with no reason and could not tell "no TV yet" from "that code is stale".
**Decision:** on a rejection the relay sends the lobby message and returns `{ ok: false, reason }` with the connection still open. The caller closes it, with the code and reason in the close frame. The phone waits and knocks again on `no-host`, and gives up and asks for a new code on anything else.
**Consequences:** the reason is part of the relay's contract now, asserted in `index.test.ts` at the socket level. Anything else that rejects a connection must close it too, or the socket leaks. The eviction paths (host lost, host replaced) still close their own sockets, because there the phone is told by the lobby message and no reason is needed.

