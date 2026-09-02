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


## D-012 — The model mutates in place and reports what happened (2026-09-01, phase 3)
**Context:** phase 3 asked for one consistent choice between returning a new state and mutating the existing one, and for `applyMessage` to say when it ignored something.
**Decision:** `applyMessage(state, msg)` and `tick(state, dtMs)` mutate `state` in place. `applyMessage` returns an `ApplyResult`: either `{ applied: true, kind, player }` (`kind` is `joined`, `rejoined`, `input` or `away`) or `{ applied: false, reason }` where `reason` is `unknown-player`, `wrong-phase` or `unsupported`. `setPhase` follows the same shape with `{ changed: true, from, to }` or `{ changed: false, reason: 'same-phase' | 'illegal' }`. Nothing in the model throws.
**Consequences:** the renderer holds one long-lived `Player` object per blob and can keep a sprite beside it without re-looking-it-up each frame, and the host uses `kind` to decide when to send `assigned`. Immutable snapshots for a future undo or replay would be a rewrite; `snapshot()` exists for the read-only cases.

## D-013 — The model moves the blobs; Phaser only draws them (2026-09-01, phase 3)
**Context:** `CLAUDE.md`'s Phaser notes say to use arcade physics with `setVelocity` and `setCollideWorldBounds`. The Testing section says the pure model's `tick` moves players by `velocity * dt` and clamps them to the world bounds. Both cannot own a blob's position: two integrators fight, and whichever one the tests assert against is the one that is really in charge.
**Decision:** the model integrates. `tick(state, dtMs)` moves every blob and clamps it to the world; `WorldScene.update` calls `tick` with the frame delta (capped at `MAX_STEP_MS`) and then sets each sprite's position from the model. Arcade physics is not enabled and no Phaser body exists.
**Consequences:** every rule about movement is unit-tested in node, the `window.__game` hook and the e2e assertions read the same numbers the TV draws, and nothing is hand-rolled in the Phaser layer — the movement simply is not in that layer. If collisions between blobs, gravity or bouncing are ever wanted, either the model grows them or this decision is revisited deliberately; do not quietly turn arcade physics back on beside a model that is still moving things. **Alex should sanity-check this one**, as it is a deliberate departure from the Phaser notes in the brief.

## D-014 — The first phone through the door starts the game (2026-09-01, phase 3)
**Context:** the model now starts in the `lobby` phase, but a phone told `phase: lobby` shows "waiting for the TV". Nothing yet knows how to leave the lobby, so the first join would have stranded everyone.
**Decision:** when a `join` arrives and the world is still in the lobby, the host moves it to `play` and broadcasts the change. Later joins are simply told the phase the world is already in.
**Consequences:** the behaviour matches phase 2 (join, then drive) with no host interaction needed. Phase 4's keyboard shortcuts can still put the world back into the lobby deliberately.

## D-015 — `window.__game` exposes the model and a snapshot (2026-09-01, phase 3)
**Context:** D-007 published `{ blobs, world }` on the host page, where `blobs` was a `Map`. Phase 3 replaced that map with the game model, and a `Map` does not survive `page.evaluate` in Playwright anyway.
**Decision:** the hook is `{ state, snapshot() }`. `state` is the live model for poking about by hand in a console; `snapshot()` returns plain, serialisable data (`world`, `phase`, and a `players` array carrying position, velocity, name, colour, slot, away, bubble text and skin key). It supersedes D-007's shape.
**Consequences:** phase 6's e2e assertions call `snapshot()`. Fields added to `Player` need adding to `PlayerSnapshot` if a test is to see them.

## D-016 — A blob may talk during play, not only during a text round (2026-09-01, phase 4)
**Context:** phase 4 asked which phases a `text` message is accepted in.
**Decision:** `play` and `text`. Anything sent from the lobby, or during a drawing round, is ignored with `wrong-phase`.
**Consequences:** a phone that is a fraction late sending — the TV changed phase while a thumb was on Send — still gets its bubble, as long as the world went back to `play`. It also leaves room for a future game mode where phones type while everyone is running about. The phone only shows the text box during a `text` round, so this is a tolerance rather than a feature.

## D-017 — Phase shortcuts on the host are P, T, D and L (2026-09-01, phase 4)
**Context:** the host needs a way to change phase, and there is no host UI beyond the TV screen.
**Decision:** a `keydown` on the host page: `P` play, `T` text, `D` draw, `L` lobby (case-insensitive; ignored when a modifier is held). The four keys are listed along the bottom of the TV with the current phase in bold, so nobody has to remember them.
**Consequences:** whoever is at the TV keyboard runs the game. An illegal move — `T` from the lobby, say — is refused by the model and nothing happens, which is why the footer shows the phase the world is actually in. A proper host UI, or driving phases from a phone, would replace this.

## D-018 — A drawing starts as the blob's own colour, in the blob's own shape (2026-09-01, phase 5)
**Context:** phase 5 asks for "a faint outline of the blob as a guide". A transparent canvas would also have meant the drawing replacing the blob entirely, losing the colour a child has just been told is theirs.
**Decision:** the drawing canvas is 256x256 and starts filled with that player's assigned colour, drawn as a rounded rectangle with the same corner ratio as the blob on the TV (14/72). The guide is the shape itself rather than an outline on top of it. Seven crayons, a 14px round stroke, "Start again" refills the background, "Done" sends. The texture key is `skin-<playerId>-<n>`.
**Consequences:** what a child draws is exactly what appears on the TV, corners and all, with no mask needed in Phaser, and a blob stays recognisably its own colour unless the child paints over it. A drawing survives a phone refresh because it lives on the model, not on the phone.

## D-019 — The host page publishes what each blob is *wearing* (2026-09-01, phase 5)
**Context:** the model saying a player has `skin-p1-1` does not prove the texture ever reached the screen: `addBase64` decodes asynchronously and the swap happens in a Phaser callback. Screenshot-diffing Phaser is ruled out by the brief.
**Decision:** `window.__game.worn()` returns the texture key each blob's sprite is actually using, read straight off the Phaser game objects.
**Consequences:** the e2e suite can assert the round trip all the way to the sprite without a single pixel comparison. It is the only place the Phaser layer is observable from outside; keep it that way.

## D-020 — A TV that has been replaced stands down (2026-09-02, phase 6)
**Context:** the relay closed a replaced host socket quietly. The host page cannot tell a quiet close from a network blip, so it reconnected, took the world back, and closed the other TV — which reconnected in turn. Two host pages open anywhere on the LAN fought over the single world indefinitely, evicting every phone on each swap. It showed up as tests interfering with each other, but it is exactly what a forgotten browser tab would do in the living room.
**Decision:** `attachHost` closes the host it replaces with close code `4002` and reason `replaced`. That is inside the client's fatal range, so the old page stops reconnecting and says "Another TV has taken over. Reload this page to take it back."
**Consequences:** the last TV to open the host page wins, once, and stays won. Anything else that hangs up on a client for good must use a 40xx code, or it will be treated as a blip and retried forever.

## D-021 — QR code by `qrcode-generator`, and phones knock while they wait (2026-09-02, phase 6)
**Context:** phase 6 needed a QR library, and the relay now keeps phones attached when the TV reconnects on the same code (which is what stops a TV reload from clearing the room). A reloaded TV has a brand new, empty model, so it does not know the phones that are still holding sockets.
**Decision:** `qrcode-generator` 2.0.4 — one file, no dependencies, renders a scalable `<svg>` string, parsed with `DOMParser` rather than assigned as `innerHTML`. And a phone showing the waiting screen re-sends `join` every two seconds until the TV answers.
**Consequences:** a TV reload puts every phone back on screen within about two seconds with nothing to retype and no reconnect. The cost is one tiny message per waiting phone every two seconds, which is nothing for eight phones on a LAN. Blob positions do not survive a TV reload — the model is in memory and always was — but names, colours and slots do, because the phone sends them again.

## D-022 — Blobs are solid, and the model is what makes them so (2026-09-02, after phase 6)
**Context:** Alex asked for basic physics so that blobs collide. D-013 had already made the model the only thing that moves a blob, so the choice was to turn arcade physics back on beside it (two owners of position, which D-013 exists to prevent) or to give the model collisions of its own.
**Decision:** the model does it. `resolveCollisions(state)` runs at the end of every `tick`: overlapping blobs are pushed apart along whichever axis they overlap least, half the distance each, and whatever a wall refuses to let one of them give is handed to the other, so a blob pinned against the edge is not slowly converged upon. Four passes per tick settles a chain. Blobs are treated as the squares they are drawn as (`BLOB_SIZE`), not as circles. A blob whose phone has gone is a ghost and collides with nothing — it is faded because it is not really there, and a child who puts a phone down should not leave a wall in the middle of the floor.
**Consequences:** driving into somebody shoves them, which is the fun of it and is proven end to end as well as in unit tests. It is positional, not dynamic: there is no bounce, no momentum transfer and no mass. Blobs cannot be squeezed out of the world. If real physics is ever wanted (bouncing off each other, being thrown), this is the place it goes — the Phaser layer still draws and nothing more. ⚠️ **`CLAUDE.md`'s Phaser notes still say to use arcade physics with `setCollideWorldBounds`; that line is now stale** and the brief wants a sentence from Alex to match D-013 and this.

## D-023 — CI builds and publishes the image; the repo is public (2026-09-02, phases 7 and 8)
**Context:** `CLAUDE.md` listed CI as future work and phase 7 had the image built and pushed by hand. Alex asked on 2026-09-02 for the image to be built by CI instead, with a new GitHub repo, matching `make-movies` and `gb`.
**Decision:** `axle-h/make-believe` on GitHub, **public**, as both siblings are (Alex confirmed). Two workflows: `ci` (typecheck, lint, unit tests, build, and the Playwright suite on chromium) and `container` (build the image, run it exactly as the Deployment does — read-only root filesystem, non-root, no capabilities — prove it serves both pages and carries a join from a player socket to a host socket, then push `:latest` and `:<sha>` on main only). Nothing auto-deploys: a new build reaches the cluster on a deliberate `kubectl rollout restart`.
**Consequences:** the "Future work: CI" line in `CLAUDE.md` and the "CI is out of scope" line in `PLAN.md` are both superseded. The GHCR package came out public on its first push and pulls anonymously, so the private-package trap the siblings warn about did not apply here. The e2e suite runs on every push, which is where the value is — it is the only thing that exercises the whole rig.

## D-024 — The smoke test must hang up its own sockets (2026-09-02, phase 7)
**Context:** the `container` workflow's smoke test opened two WebSockets, proved the relay carried a join, and then hung for twelve minutes until the run was cancelled.
**Decision:** it closes both sockets and calls `process.exit(0)`, and the step carries `timeout-minutes: 3`.
**Consequences:** an open socket keeps node's event loop alive, so any future script in CI that talks to the relay has to hang up explicitly. The step cap means the next hang of any kind costs three minutes rather than the job's full thirty.

## D-025 — The TV is the game and nothing else; the QR code is the only way in (2026-09-02, after phase 8)
**Context:** Alex asked for the play area to be full screen, the "MAKE believe" banner gone, and the QR code floated over the game. The banner also carried the join URL and the four-letter code in text, and the phone's join screen led with a field to type that code into.
**Decision:** the host page is one full-bleed world with the QR code floating over its top-right corner (a small margin, a light border, a shadow) and the phase/status line in a quiet pill at the bottom-left. The code is written nowhere on screen — it has always been inside the QR code's URL as `?room=`, and that is now the only place it appears. The phone follows: no code field at all. A player page opened with a valid `?room=` (or holding one from last time) asks for a name; one opened bare shows a scan screen — "Scan the QR code on the TV to join" — and every way of failing to get in (a stale code, a rejection) lands back there rather than on a form. The host's code moves to the test seam as `window.__game.roomCode`, since the e2e suite used to read it out of the DOM.
**Consequences:** the world gets the whole TV, and joining is one scan with nothing to read out loud. The cost is that a device that cannot scan — a laptop on the sofa — can no longer be told the code, because nobody can see it; it needs the link. If that turns out to matter, the answer is a keypress on the TV that reveals the code, not the banner coming back. The `#room-code`, `#join-url` and `#room-input` elements are gone, so anything looking for them (a screenshot, a script) needs the seam instead.

## D-026 — One continuous session: no rounds, and the TV takes no input (2026-09-02, after phase 8)
**Context:** Alex asked what the `P play / T text / D draw / L lobby` line on the TV was, then set out how the blob game actually works: phones join by QR, and from then on every player can drive, say something, redraw their blob and rename it whenever they like. The TV was to have no input at all. The build had a four-phase state machine instead, with the TV's keyboard as the only way to change round and every phone told which single screen to show.
**Decision:** phases are gone — the model, the protocol, the host and the phone. `GameState` has no `phase`, `phases.ts` and its transition table are deleted, and `applyMessage` no longer asks what the world is doing before accepting text or a drawing. On the wire, `{ type: 'phase', … }` is replaced by `{ type: 'waiting' }`, sent by the *relay* only, meaning "no TV for you: wait and keep knocking"; `assigned` is now the phone's cue that it is in, since it only ever arrives in answer to a hello. The host page has no `keydown` handler and no footer of shortcuts; the one thing it says for itself is a connection status that is invisible when all is well. The phone is one controller screen — name, joystick, and a Say / Draw / Name bar — with those three as overlays that never take the joystick away for longer than a tap. Renaming needs no message of its own: saying hello again with a new name is what a rename is, and `join` already keeps the blob a known `playerId` owns.
**Consequences:** there is no way to make players wait, and no legal/illegal transition to reason about — every message is welcome the moment a blob exists. `HostOutboundMessage` is now a single message type; if the TV ever needs to tell phones something again it goes back to being a union. Rounds are not forbidden forever (milestone 11 may want them), but they would have to arrive as a real game idea, and this decision is the one to reopen. Supersedes D-014 (the first phone starting the game), D-016 (text and drawing allowed during `play`) and D-017 (the phase shortcuts) — all three were about a phase machine that no longer exists.
