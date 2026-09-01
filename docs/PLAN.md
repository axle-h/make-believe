# MAKE believe — implementation plan

Phases follow the milestones in `CLAUDE.md`. Each phase is a runnable increment: at the end of it the app works end to end with one more feature than before. See `README.md` in this folder for the protocol on how to update this file.

| # | Phase | Status | Updated | Summary |
|---|---|---|---|---|
| 1 | [Skeleton](phases/01-skeleton.md) | not-started | 2026-09-01 | Workspace, shared schemas, relay server, both web pages on a plain canvas, Dockerfile. |
| 2 | [Join and names](phases/02-join-and-names.md) | not-started | 2026-09-01 | Proper join screen with name entry; name label above each square. |
| 3 | [Game model and Phaser](phases/03-game-model-and-phaser.md) | not-started | 2026-09-01 | Pure TS game model with tests; replace the plain canvas with Phaser 4. |
| 4 | [Text phase](phases/04-text-phase.md) | not-started | 2026-09-01 | Phone text input shown as a speech bubble above the blob. |
| 5 | [Draw phase](phases/05-draw-phase.md) | not-started | 2026-09-01 | Phone drawing canvas becomes the blob's skin. |
| 6 | [QR, reconnect, e2e](phases/06-qr-reconnect-e2e.md) | not-started | 2026-09-01 | QR code on the TV, reconnect handling, Playwright end-to-end suite. |
| 7 | [Deploy to k3s](phases/07-deploy-k3s.md) | not-started | 2026-09-01 | Namespace `make-believe`, image on GHCR, single-replica deployment, ClusterIP service. |
| 8 | [HTTPS at the edge](phases/08-https-edge.md) | not-started | 2026-09-01 | `believe.ax-h.com` via the existing ddns, Traefik and cert-manager setup; WebSocket through the edge. Prerequisite for the PWA. |
| 9 | [Phone PWA](phases/09-phone-pwa.md) | not-started | 2026-09-01 | Installable, self-updating player app: manifest, network-first service worker, safe reload. |
| 10 | [Android TV app](phases/10-androidtv-app.md) | not-started | 2026-09-01 | Native Kotlin WebView wrapper on the TV home screen (target: Fire TV Stick 4K Max, API 28); loads the host page remotely so it updates itself. |

Status values: `not-started`, `in-progress`, `done`, `blocked`. Only one phase is `in-progress` at a time.

## Out of scope

Listed in `CLAUDE.md` under "Future work". Do not implement: persistence, CI, actual game modes beyond the four initial features. Ingress/TLS and the client wrappers used to be future work; they are now phases 8 to 10 and must still not be started early.

**Multiple rooms are strictly out of scope, permanently.** One deployment serves one host and one world. The 4-letter room code is a session key for that single world, nothing more. Do not build a room registry, room lookup, or anything keyed by room.
