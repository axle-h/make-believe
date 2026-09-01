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
