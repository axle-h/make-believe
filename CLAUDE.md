# MAKE believe

Repo: `make-believe`. Styled **MAKE believe** in UI and docs (the `make-`/MAKE prefix is a family naming convention — keep the capitalisation). In-game characters are called **blobs**.

## What we're building

A party game for my kids, played on the TV with phones as controllers. It runs on the TV (the **host**), with each child using an Android phone or a laptop browser as their controller (a **player**). The big screen shows the world, the phones are dumb input devices.

Initial feature list:
1. Move a blob around on the TV
2. Name your blob (shown as a label above it)
3. Draw something on the phone that appears as the blob's skin/overlay
4. Type text on the phone that appears on the TV (speech bubble above the blob)

**One continuous session, no rounds.** Everything above is available to every
phone the whole time: drive, say something, redraw your blob, take a new name,
in any order, whenever. **The TV takes no input at all** — no keyboard, no
remote, nothing to click. It is a window onto the world; the phones run it.
Rounds may arrive one day with an actual game idea (milestone 11); until then
nothing may put a phone into a mode or make it wait its turn.

Android + desktop browsers only. iPhone is explicitly not a target.

## Architecture — one deployment, path-routed

Everything ships as **one container running one Node process**. The two "modes" are just URL paths served from a single Vite build:

| Path | What it is | Runs where |
|---|---|---|
| `/host/` | Phaser 4 game. Single source of truth for all game state. | A browser on whatever drives the TV (laptop on HDMI, Android TV box, Pi) |
| `/` | Player page: touch joystick, text inputs, drawing canvas. No Phaser, no game logic. | Phone / laptop browser, joined via QR code |
| `/ws` | WebSocket relay between the one host and its players | The Node server |
| `/healthz` | Liveness/readiness for k8s | The Node server |
| `/version` | The build the pages beside it came from, so an installed phone can tell it is out of date | The Node server |

**Non-negotiable rule: the host owns ALL game state. Players are dumb.** They send inputs and receive small instructions ("you are blue", "show the drawing UI"). Never sync game state to phones; never run game logic on phones. A phone that drops off just reconnects and carries on.

**One world, ever.** A deployment serves exactly one host and one world; there is no concept of multiple rooms and there never will be. The relay holds the current host socket, its players, and the current room code in plain server memory.

**No persistence.** If the pod restarts, everyone rejoins. This means **exactly one replica** — never scale the Deployment.

## Decisions already made (don't relitigate)

- **pnpm workspaces**, not npm/yarn. `pnpm-workspace.yaml` at the root.
- **Web, not native Android apps.** QR code on TV → phones scan → in. Native wrappers are a packaging concern for later.
- **WebSockets via a relay, not WebRTC.**
- **Phaser 4**, the open-source npm library. NOT Phaser Editor (paid), NOT Phaser Game Agent (cloud credits). Phaser is just a dependency.
- **Single Vite build, multi-page mode.** Two HTML entries (`index.html` for players, `host/index.html` for the host) → one `dist/`. Vite code-splits per entry, so Phaser never ships to phones.
- **Plain Node server (`node:http` + `ws` + `sirv`), NOT TanStack Start.** Rationale: Start's WebSocket story is unreliable (h3 v2 / srvx don't do the upgrade cleanly as of mid-2026), we have no SSR or server-function needs, and the server is ~150 lines of relay. Don't introduce Express/Fastify/Hono either unless there's a concrete need.
- **Plain TypeScript + DOM for the player UI** by default. React (via Vite, *not* Start) is acceptable later if the player screens get fiddly. The host is Phaser and needs no UI framework.
- **A 4-letter room code**, even at home — it identifies *tonight's* session of the single world and stops a stale phone session attaching to it. It is a session key, not a room selector. **Multiple rooms are strictly out of scope.**
- **Players get a persistent `playerId` in localStorage** so a refresh reattaches to the same blob.
- **Server is bundled to a single file with esbuild** so the runtime image has no `node_modules` at all.

## Repo layout

```
/
  pnpm-workspace.yaml
  package.json              # root scripts: dev, build, test, test:e2e, lint, typecheck
  tsconfig.base.json
  Dockerfile
  k8s/                      # deployment, service, traefik ingress + middleware
  e2e/                      # Playwright tests (root-level, exercise the built app)
  androidtv/                # Android TV (Kotlin) WebView wrapper for the host. Gradle project, not a pnpm package. Not built yet — docs/android-tv.md.
  packages/
    shared/                 # message types + zod schemas, room-code helpers. Zero runtime deps except zod.
    web/                    # ONE Vite project
      index.html            # → served at /        (player)
      host/index.html       # → served at /host/   (TV)
      src/player/           # joystick, canvas, text screens, ws client
      src/host/
        game/               # PURE TS game model — no Phaser imports. See "Testing".
        phaser/             # scenes; render the model, forward ws messages into it
        main.ts
      src/lib/              # ws helpers shared by both pages
      vite.config.ts        # build.rollupOptions.input = { player: 'index.html', host: 'host/index.html' }
                            # server.proxy['/ws'] = { target: 'ws://localhost:3000', ws: true }
    server/
      src/index.ts          # http server: /healthz, /ws upgrade, sirv for web/dist
      src/relay.ts          # single-world host/player registry + forwarding logic (pure, testable)
      src/relay.test.ts
```

Only `shared/` is cross-imported. `web` and `server` never import each other.

## Message protocol (packages/shared/src/messages.ts)

All messages are JSON over one WebSocket. Define them as **zod schemas** and derive the TS types — the server validates every inbound message and drops anything invalid; the host and player trust nothing that hasn't been parsed.

```ts
// player → host
{ type: 'join',    playerId: string, name: string }
{ type: 'input',   playerId: string, dx: number, dy: number }   // normalised -1..1, ~30/sec while touching, only on change
{ type: 'drawing', playerId: string, png: string }              // data:image/png;base64,... from canvas.toDataURL()
{ type: 'text',    playerId: string, value: string }            // cap ~60 chars

// host → player
{ type: 'assigned', colour: string, slot: number }              // also the phone's cue to show its controller

// relay → player (never sent by the host)
{ type: 'waiting' }                                             // no TV for you: wait and keep knocking

// connection setup (query string on /ws)
/ws?role=host&room=ABCD
/ws?role=player&room=ABCD&playerId=...
```

Relay semantics:
- One host socket, full stop. A new host connection replaces the current one and sets the current room code (handles TV refresh). Players connecting with a code that does not match the current one are rejected.
- Player messages are forwarded to the host, tagged with `playerId`. Host messages carry a `to: playerId` (or `to: '*'`) and are forwarded accordingly.
- If the host disconnects, the world is torn down and players get a `{ type: 'waiting' }` so they show "waiting for TV".
- If a player disconnects, the host gets `{ type: 'left', playerId }`.

## Server (packages/server)

- Node 22, `node:http`. Routes: `GET /healthz` → 200; `GET /version` → the build string the web build wrote to `web/dist/version.txt`, `no-store`; `Upgrade` on `/ws` → `ws` server; everything else → `sirv('../web/dist', { single: false })` so `/host/` resolves to `host/index.html`.
- Static cache headers: hashed `/assets/*` are `immutable`, everything else (both pages, the worker, the manifest) is `no-cache`. A phone holding a stale page across a deploy is the one thing the service worker exists to prevent, so nothing but a hashed filename may be kept without asking.
- `relay.ts` exports a `createRelay()` that takes no I/O — it's a pure single-world registry (one host slot, a `Map` of players, the current room code) with `attachHost`, `attachPlayer`, `route(msg)` etc. No `Map` of rooms. `index.ts` wires sockets to it. This split is what makes it testable without real sockets.
- Port from `PORT` env, default 3000. Listen on `0.0.0.0`.
- Dev: `tsx watch src/index.ts`. Prod: `esbuild src/index.ts --bundle --platform=node --target=node22 --outfile=dist/index.js`.

## Dev workflow

`pnpm dev` at root runs, in parallel:
- `packages/web`: `vite` on :5173 — serves both pages, proxies `/ws` to :3000
- `packages/server`: `tsx watch` on :3000

Open `http://localhost:5173/host/` on the TV, `http://<lan-ip>:5173/` on phones (set `server.host: true` in Vite config so it binds to the LAN). Hot reload works on both.

`pnpm build` runs `vite build` then the esbuild bundle. `pnpm start` runs `node packages/server/dist/index.js`, which serves the built app on :3000 — same as the container.

## Testing

Vitest at the root with per-package projects (`vitest.workspace.ts`). `pnpm test` runs everything below except e2e.

**`shared`** — pure unit tests.
- Every zod schema: valid message parses, malformed message rejects, oversize `png`/`text` rejects.
- Room-code generator: length, charset, no ambiguous chars (0/O, 1/I).

**`server`** — unit tests on `relay.ts` (no sockets) + one integration test with real sockets.
- Unit: attach host, attach two players, route a player `input` → host receives it with `playerId`; host `to: '*'` fans out; host disconnect tears down the world; second host replaces first; player with a stale/wrong room code rejected; player connecting before any host rejected.
- Integration (`index.test.ts`): start the real server on port 0, connect real `ws` clients as host + 2 players, assert end-to-end forwarding and that `/healthz` is 200. One test, kept fast.

**`web` — host game model** (`src/host/game/`). This is the important one.
- The game model is **pure TypeScript with no Phaser imports**: `createGame()`, `applyMessage(state, msg)`, `tick(state, dtMs)`, plus selectors. Phaser scenes only read from it and push messages into it.
- Vitest (node environment, no jsdom needed): join spawns a player at a sane position; input then `tick` moves them by `velocity * dt`; world bounds clamp; `text` creates a bubble that expires after N ms of ticks; `drawing` sets a skin key and a fresh key on every redraw; a second `join` from a known `playerId` renames the blob and keeps everything else; `left` removes the player.
- **Phaser itself is not unit-tested.** It needs a canvas/WebGL and jsdom can't provide one. Keep the Phaser layer thin enough that it doesn't need to be.

**`web` — player**
- Joystick maths (pointer position → normalised `{dx,dy}`, dead zone, clamp to unit circle) as pure functions, unit-tested.
- Message send throttling (only on change, max ~30/sec) as a pure function over a fake clock, unit-tested.
- DOM wiring is covered by e2e, not unit tests.

**e2e (`/e2e`, Playwright)** — runs against `pnpm build && pnpm start`.
- One browser context opens `/host/` and reads the room code off the `window.__game` test hook. Nothing on the TV spells the code out — it lives only inside the QR code's URL.
- Two more contexts open `/?room=<code>` (the link the QR code carries), enter a name, and join.
- Assert: host shows two players with the right names; simulating a joystick drag on player 1 moves only player 1's sprite (assert via a `window.__game` test hook exposing model state on the host page — do not screenshot-diff Phaser); text from player 2 appears as a bubble; a drawing round-trips a PNG; a blob is renamed and redrawn mid-game without losing its place.
- Uses Playwright's `webServer` option to start the built app. `pnpm test:e2e`. Not run on every `pnpm test` — it's slower and needs browsers installed.

Conventions: `*.test.ts` next to the code. No mocking of `shared` — it's tiny and pure. No snapshot tests.

## Deployment — single container in k3s

**Dockerfile** (multi-stage):
1. `node:22-alpine` + `corepack enable`; copy lockfile + workspace manifests; `pnpm install --frozen-lockfile`; copy source; `pnpm build`.
2. `node:22-alpine` runtime: copy `packages/server/dist/index.js` and `packages/web/dist/`. No `node_modules`. `USER node`. `EXPOSE 3000`. `CMD ["node", "server/index.mjs"]`.

**k8s/** — a `Deployment` (replicas: 1, `strategy: Recreate` since the world is in-memory and two pods would split it), a `ClusterIP` `Service` on 3000, readiness + liveness probes on `/healthz`. Resource requests can be tiny.

## Future work (explicitly out of scope for now — do not implement)

- Any persistence (scores, saved drawings).

## Milestones

Milestones 1 to 9 are **done and deployed**: the workspace and relay, join and
names, the pure game model under Phaser, speech bubbles, drawings as blob skins,
the QR code and reconnect handling with a Playwright suite, k3s, HTTPS at the
edge, and the phone PWA. What they built is described by the code, the commit
history and `k8s/README.md` — don't go looking for a plan document for any of it.

What is left:

10. Android TV app: minimal native Kotlin WebView wrapper in `/androidtv`, leanback launcher entry, loads the host page remotely so it updates itself. Not Capacitor, not a browser. Target device is a Fire TV Stick 4K Max (Fire OS 7, Android 9, API 28); nothing Fire-specific. Planned in [`docs/android-tv.md`](docs/android-tv.md).
11. Then actual game ideas — and the place rounds would come back, if they ever do.

## Phaser notes (host)

- `new Phaser.Game({ type: Phaser.AUTO, width: 1280, height: 720, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [...] })`.
- **Arcade physics is deliberately not enabled.** The pure model owns every blob's position: `tick` integrates movement, clamps to the world bounds and separates overlapping blobs, and the scene's `update` calls `tick` then copies positions onto sprites. Two integrators would fight, and the model is the one that is unit-tested and that the e2e suite reads. If real physics is ever wanted (bounce, momentum, mass), it grows in `src/host/game/`, not in the Phaser layer — do not quietly turn arcade physics back on beside a model that is still moving things.
- Scenes: `preload` / `create` / `update`. The socket lives in `main.ts`, not the scene; messages go into the game model and the scene only draws it.
- Drawing: `this.textures.addBase64(key, png)`, then on the `addtexture-<key>` event call `sprite.setTexture(key)`.
- Names and speech bubbles are `this.add.text(...)` objects positioned relative to the sprite each frame; fade bubbles with a tween then `destroy()`.
- Verify Phaser 4 APIs against `node_modules/phaser/types/phaser.d.ts` if unsure; don't guess from Phaser 3 memory.

## Player notes

- Touch joystick: `nipplejs` or ~50 lines of pointer-event code. Send normalised `{dx, dy}`, throttled.
- Drawing: fixed-size canvas (256×256) that starts as the blob itself — the player's own colour, in the same rounded-square shape — so the guide is the shape rather than an outline on top of it. "Done" → `toDataURL('image/png')` → send.
- Wake Lock API to stop phones sleeping (may be unavailable without HTTPS — degrade gracefully).
- Mobile keyboards shift layout — test the Say sheet on a real phone early.
- The player page is an installable PWA: `public/manifest.webmanifest`, `public/sw.js` (hand-written, ~60 lines, network-first, no Workbox and no build plugin), icons generated from `public/icons/blob.svg` by `scripts/icons.mjs` and committed. **Only the player page** — the host page links no manifest and the worker never touches `/host/`.
- Staleness is decided by one thing: `/version` against the page's own `__BUILD_VERSION__`, checked on every connect and whenever a new worker takes over. A mismatch reloads the phone — but only on the scan or waiting screen, never mid-joystick (`src/player/updates.ts`, which is where that rule is unit-tested).

## How I want to work

- Small, runnable increments, one milestone at a time and in order.
- Tests alongside the code they test, written in the same change.
- Don't add dependencies beyond `phaser`, `ws`, `sirv`, `zod`, `nipplejs` (optional), a QR library, `vitest`, `playwright`, `tsx`, `esbuild` without asking.
- Keep the three packages cleanly separated; `shared` is the only cross-import.