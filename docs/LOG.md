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

