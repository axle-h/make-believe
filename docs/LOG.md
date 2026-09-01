# Work log

Append-only. Newest entry at the bottom. Format is in `README.md`.

## 2026-09-01 — setup — Claude (Fable 5.1)
- Did: created `README.md` at the repo root and this `docs/` folder with the protocol, plan, and seven phase files.
- Also: Alex ruled multiple rooms strictly out of scope. Brief, README, PLAN and phases 1 and 6 updated so the relay is a single-world registry and the 4-letter code is a session key only.
- Also: added phases 8 (HTTPS), 9 (phone PWA) and 10 (Android TV app, targeting the Fire TV Stick) at Alex's request; moved ingress/TLS and native wrappers out of the brief's future-work list into milestones 8 to 10.
- Also: refined phases 7 and 8 against the real cluster (k3s on `nas`, Traefik, cert-manager HTTP-01, ddns CronJob managing `*.ax-h.com` A records, GHCR images) so no discovery is needed later.
- Verified: nothing to verify yet; no code exists.
- Next: a coding agent starts phase 1.
