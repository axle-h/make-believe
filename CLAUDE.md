# MAKE believe

Repo `make-believe`, styled **MAKE believe** (keep the capitalisation). A party game for my kids:
the TV runs the world (the **host**, `/host/`, Phaser 4), each child drives a **blob** from an Android
phone or a laptop browser (a **player**, `/`, plain TS + DOM). One container, one Node process,
`/ws` relays between them. iPhone is not a target. Every milestone is built and deployed.

## Rules of the road

- The host owns all game state; phones send input and get small instructions, nothing more.
- One world per deployment, no rooms, no persistence, exactly one replica.
- One continuous session, no rounds: drive, say, draw and quit are live on every phone throughout.
  Nothing puts a phone into a mode or makes it wait, except the eleventh phone (ten colours, ten blobs).
- The TV takes no input. The only exceptions are the `d` debug menu (`src/host/debug.ts`) and the
  Android remote's Back and Menu.
- The grown-up menu goes to the one blob the host names Daddy (`src/host/game/grownup.ts`). It is a
  secret from the children and the secret is the protection: nothing in any markup, UI or shipped
  code hints at it, it is never shown disabled, and the join screen behaves the same for every name.
- The session code is in no URL and nobody types it; the QR code carries the address and nothing else.
- Every task obeys the five rules in `src/host/game/objectives/types.ts`; `registry.test.ts` pins them.
- Pictures are emoji capped at Emoji 5.0 because the TV is Android 9: add to `SAFE_GLYPHS` only.
- Arcade physics is off; the pure model in `src/host/game/` owns every position.
- `askFor` in `e2e/world.ts` is the only e2e seam past the UI. No second one, and never to skip the climb.

## Decided, don't relitigate

pnpm workspaces; web, not native apps; a WebSocket relay, not WebRTC; Phaser 4 from npm (not Phaser
Editor or Game Agent); one Vite multi-page build; `node:http` + `ws` + `sirv` (no TanStack Start,
Express, Fastify or Hono); server bundled by esbuild so the image has no `node_modules`.
Dependencies beyond `phaser`, `ws`, `sirv`, `zod`, `nipplejs`, `qrcode-generator`, `vitest`, `playwright`,
`tsx`, `esbuild`, `oxlint` and `vite` need asking first.

## Read before touching

| Area | Read first |
|---|---|
| Any message | `packages/shared/src/messages.ts`: five unions, not interchangeable |
| Relay | `packages/server/src/relay.ts` (pure) and `server.ts` (sockets, cache headers) |
| Game model | `packages/web/src/host/game/`; `purity.test.ts` keeps Phaser and `window` out |
| Tasks, ladder | `objectives/types.ts`, `registry.ts`, `director.ts` |
| Rendering | `src/host/phaser/worldScene.ts`; check Phaser 4 APIs in `packages/web/node_modules/phaser/types/phaser.d.ts` |
| Phone | `src/player/main.ts`; sounds in `sounds.ts` and `audio.ts`; bounce voices from `scripts/bounce.mjs` |
| Build staleness | `src/lib/version.ts`, `src/host/updates.ts`, `src/player/updates.ts` |
| Glyphs, themes | `packages/shared/src/glyphs.ts`, `themes.ts` |
| Deploy | `k8s/README.md` |
| TV app | `androidtv/README.md`; the release keystore lives outside the repo and is never replaced |

## Testing

`pnpm typecheck && pnpm lint && pnpm test`; `pnpm test:e2e` against the built app. Tests sit next to
the code as `*.test.ts` and ship in the same change. Phaser, the `AudioContext` and DOM wiring are
not unit-tested; keep them thin and cover them in e2e, which reads the model off `window.__game` and
never screenshot-diffs. No mocking `shared`, no snapshot tests.

## How I work

- Small, runnable increments, tests alongside.
- Keep the three packages separate; `shared` is the only cross-import.

## Keeping it tidy

- Plans live in `docs/PLAN-*.md`, excluded from git, and nothing cites them.
- A comment earns its place by carrying a constraint, and is then one or two sentences.
- A new invariant goes first as a comment on the code that enforces it, then as one line here if
  it is a rule of the road.
- README and CLAUDE.md stay slim; no history, dates or milestone numbers anywhere. Terse wins.
