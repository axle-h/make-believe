# Work log

Append-only. Newest entry at the bottom. Format is in `README.md`.

## 2026-09-01 — setup — Claude (Fable 5.1)
- Did: created `README.md` at the repo root and this `docs/` folder with the protocol, plan, and seven phase files.
- Also: Alex ruled multiple rooms strictly out of scope. Brief, README, PLAN and phases 1 and 6 updated so the relay is a single-world registry and the 4-letter code is a session key only.
- Also: added phases 8 (HTTPS), 9 (phone PWA) and 10 (Android TV app, targeting the Fire TV Stick) at Alex's request; moved ingress/TLS and native wrappers out of the brief's future-work list into milestones 8 to 10.
- Also: refined phases 7 and 8 against the real cluster (k3s on `nas`, Traefik, cert-manager HTTP-01, ddns CronJob managing `*.ax-h.com` A records, GHCR images) so no discovery is needed later.
- Verified: nothing to verify yet; no code exists.
- Next: a coding agent starts phase 1.

## 2026-09-01 — phase 1 — Claude (Opus 5)
- Did: built the skeleton end to end. pnpm workspace with `shared`/`server`/`web`, zod message schemas and room codes, the single-world relay plus its unit and socket-level tests, the plain-canvas host page, the player page with a pointer joystick, the Vite two-page build, and the multi-stage Dockerfile.
- Fixed on the way: the joystick throttle dropped the newest vector instead of flushing it, so a quick flick never started the blob moving. The pad now sends on the pointer event and keeps draining the latest vector while held.
- Decisions: D-003 to D-008 (message caps, vitest projects, ESM server bundle, oxlint, the `window.__game` seam, and evicting players on a host change).
- Verified: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (59 tests, 5 files), `pnpm build` + `pnpm start` with `/healthz` and `/host/` checks, `docker build` + `docker run` with the same checks. Manual check done in Chrome against `pnpm dev`: two phones joined by code, each pad moved only its own square, release stopped it, closing a phone removed its square.
- Next: phase 2 — name entry on the phone and a name label above each square.

## 2026-09-01 — phase 2 — Claude (Opus 5)
- Did: join screen with a code and a name on the phone, name labels above the squares on the TV, and a "waiting for the TV" screen that knocks again until the TV answers. Pulled the host's state out of `main.ts` into a pure `src/host/blobs.ts` so the rejoin rule is testable; `main.ts` is now socket, canvas and frame loop only. Name helpers (`normaliseName`, `isValidName`) went into `shared/src/blobName.ts` and the `join` schema now refuses a blank or whitespace-only name.
- Fixed on the way: the relay closed a rejected player socket itself, so the server's `4001` close and its reason were dropped and the phone saw a bare 1005. The phone needs that reason to tell "no TV yet" from "stale code", so the relay now leaves the socket for the caller to close, asserted at the socket level in `index.test.ts`.
- Also: a `left` used to delete the blob, which made "a refresh keeps your square" impossible. A blob whose phone has gone now waits on screen, faded and stopped, for 30 seconds.
- Decisions: D-009 (away blobs), D-010 (the phone remembers the code too), D-011 (the relay's reject contract).
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (89 tests, 8 files), `pnpm build`. Manual check in Chrome against the built app: two named phones, one pad moving only its own blob, a phone refresh keeping slot, colour, name and position with no retyping, a server restart recovering on its own, and a TV reload sending the phones back to the form saying the code has changed.
- Notes for next time: the away purge was proven by unit test and by winding one blob's clock forward in the page — a backgrounded tab's `requestAnimationFrame` is paused, so wall-clock waits in a background tab prove nothing. `sirv` caches its file listing at startup, so a rebuild needs the dev server restarted or new hashed assets 404.
- Next: phase 3 — grow `blobs.ts` into the pure game model under `src/host/game/` and swap the canvas for Phaser.


## 2026-09-01 — phase 3 — Claude (Opus 5)
- Did: grew `blobs.ts` into the pure game model under `src/host/game/` (`state`, `apply`, `tick`, `phases`, `selectors`, `constants`) with 41 tests, then replaced the plain canvas with Phaser 4.2.1. `main.ts` is now socket and wiring only; `phaser/worldScene.ts` draws the model and nothing else. Added `snapshot()` so the e2e hook can get plain data out of the page, and a `purity.test.ts` that greps the model directory for Phaser and DOM references.
- Decided on the way: D-012 (mutate in place, report the outcome), D-013 (the model integrates movement, Phaser only draws — a deliberate departure from the brief's arcade-physics note, worth Alex's eye), D-014 (the first join starts the game), D-015 (`window.__game` is now `{ state, snapshot() }`, superseding D-007).
- Also: the host page now fits one screen with no scrollbars. Phaser's `Scale.FIT` measures its parent, so the canvas is taken out of flow — in flow it grew its own parent and overflowed the TV.
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (111 tests, 12 files), `pnpm build` (player bundle 4 kB + 86 kB shared, host 1.38 MB — Phaser never reaches a phone). Checked in Chrome against `pnpm build && pnpm start`: two players joined, both blobs drawn with names, movement and world bounds correct, no page overflow.
- Next: phase 4 — text phase and speech bubbles.

## 2026-09-01 — phase 4 — Claude (Opus 5)
- Did: the text round. `BUBBLE_MS` bubbles on the model with `tick` counting them down, a Phaser bubble with a tail that fades out when the model drops it, phase shortcuts on the TV with the current phase shown along the bottom, and a text box with a live counter on the phone.
- Decisions: D-016 (text is accepted during `play` as well as `text`), D-017 (the `P`/`T`/`D`/`L` mapping).
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (120 tests, 12 files), `pnpm build`. Checked in Chrome against the built app: a phone joined, `T` on the TV moved it to the text screen, "hello mum" appeared as a bubble above the right blob.
- Next: phase 5 — the drawing round.

## 2026-09-01 — phase 5 — Claude (Opus 5)
- Did: the drawing round. A 256x256 canvas on the phone that starts as a rounded square of the player's own colour, seven crayons, "Start again" and "Done"; pure pointer-to-canvas maths and the size guard in `src/player/drawing.ts` with tests. The model keeps `{ key, png }` per player and the Phaser scene turns a new key into a texture with `addBase64`, dropping the old one so the GPU does not fill up.
- Decisions: D-018 (the canvas starts as the blob, so the guide is the shape itself), D-019 (`window.__game.worn()` reports the texture each sprite is really using).
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (131 tests, 13 files), `pnpm build`. Checked in Chrome against the built app: `D` on the TV moved the phone to the drawing screen, strokes drew, Done sent a 5 kB PNG and the model picked up a new skin key.
- Notes for next time: a Chrome tab driven by the extension while the window is in the background gets **zero** `requestAnimationFrame` callbacks, so Phaser's loop is completely stopped and nothing rendered can be judged from a screenshot. Anything that has to be seen needs a visible page — which in practice means the Playwright suite.
- Next: phase 6 — QR code, reconnect, e2e.

## 2026-09-02 — phase 6 — Claude (Opus 5)
- Did: QR code on the TV (`qrcode-generator`, rendered as an SVG beside the room code), the room code kept in `sessionStorage` so a TV reload reuses it, the relay keeping phones attached when the TV comes back on the same code, a two-second knock from any waiting phone, a "Reconnecting…" badge, Wake Lock on the phone, and the Playwright suite in `/e2e` with three tests.
- Fixed on the way, and it is a real bug rather than a test artefact: a replaced TV was closed quietly, so it reconnected and took the world back, and two host pages anywhere on the LAN fought over the single world forever, evicting every phone on each swap. The relay now closes a replaced host with `4002 replaced` and the old page stands down and says so (D-020). It surfaced as tests interfering with each other — and as a stray browser tab of mine stealing the world mid-run.
- Decisions: D-020 (a replaced TV stands down), D-021 (the QR library, and the knock heartbeat).
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (137 tests, 14 files), `pnpm build`, `pnpm test:e2e` (3 tests, run twice through with `--repeat-each=2`, all green). The e2e covers: two phones joining by code, names on the TV, one joystick moving only its own blob and stopping on release, a speech bubble appearing and expiring, a drawing round-tripping as far as the sprite's texture (`window.__game.worn()`), a phone reload keeping its blob, and a TV reload with the phones carrying on.
- Next: phase 7 — k3s. It needs the cluster and a GHCR push, so it wants Alex.

## 2026-09-02 — phase 7 (part) — Claude (Opus 5)
- Did: the manifests only. `k8s/make-believe/deployment.yml`, `k8s/make-believe/service.yml` and `k8s/README.md`, in the sibling projects' house style. Rebuilt the container with the phase 3 to 6 code and ran it `--read-only --cap-drop ALL --user 1000:1000` to prove the security context in the deployment is actually what the image can live with.
- Not done, deliberately: nothing was pushed to GHCR and nothing was applied to the cluster. There are no ghcr.io credentials on this machine, so the push needs Alex; applying before the image exists would only park an `ImagePullBackOff` in the cluster. Alex also asked this session to stop at the deployment.
- Verified: `kubectl apply --dry-run=client -f k8s/make-believe/` passes; the local image serves `/healthz`, `/host/` and `/` read-only as uid 1000.
- Next: Alex pushes the image and applies, then phase 8.

## 2026-09-02 — blob collisions (out of phase, at Alex's request) — Claude (Opus 5)
- Did: blobs are solid. `src/host/game/collisions.ts` separates overlapping blobs at the end of every `tick` — least-overlapping axis, half each, with a wall's share handed to the other blob — plus its own tests and an e2e test that drives one blob into another and watches it get shoved. Away blobs are ghosts and collide with nothing.
- Decisions: D-022. It stays in the model rather than going back to arcade physics, for the reason D-013 gives: two owners of a blob's position fight.
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (146 tests, 15 files), `pnpm test:e2e` (4 tests).
- Note for Alex: `CLAUDE.md`'s Phaser notes still prescribe arcade physics and `setCollideWorldBounds`, which is no longer what the code does. The brief wants a line changing to match D-013 and D-022.
- Next: phase 7 still wants the GHCR push and the apply.

## 2026-09-02 — phases 7 and 8 — Claude (Opus 5)
- Did: it is live at <https://believe.ax-h.com>. Created `axle-h/make-believe` (public) and pushed; wrote `.github/workflows/ci.yml` and `container.yml` in gb's shape, so the image is built, smoke-tested and published by CI rather than by hand (D-023). Created the `make-believe` namespace, applied the deployment and service, then the traefik middleware and the ingress; cert-manager issued the certificate in about 30 seconds.
- Fixed on the way: the container workflow's smoke test proved the relay worked and then hung for twelve minutes — an open WebSocket keeps node's event loop alive, so the script never exited (D-024). It now hangs up and exits, with a three-minute cap on the step.
- Also: the ingress uses `spec.ingressClassName` rather than the deprecated `kubernetes.io/ingress.class` annotation the siblings still carry, because kubectl warns on every apply.
- Verified: `https://believe.ax-h.com/healthz` 200 with a valid Let's Encrypt certificate, `http` 301s to `https`, both pages 200. A node WebSocket client carried a join over `wss://` and was still carrying input after 35 seconds idle — traefik does not time the socket out. A real headless Chromium then played a game through the edge: the TV page, a Pixel-7-shaped phone joining from the QR link, and the joystick moving that blob and no other. The QR encodes `https://believe.ax-h.com`, the origin is secure and the Wake Lock API is present. No page errors on either side.
- Not done: Wake Lock is present but only a real Android phone can prove a lock actually holds a screen awake, and nothing has been tried on real hardware yet — the phone-shaped checks from phases 4, 5 and 6 are all still outstanding and now have a public URL to be done against.
- Next: phase 9, the PWA.
