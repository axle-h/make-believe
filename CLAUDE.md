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
phone the whole time: drive, say something, redraw your blob, in any order,
whenever — plus finishing with a blob, which is the one thing that undoes
anything and hands the phone back to the name screen. **The TV takes no input
during play** — no remote, nothing to click. It is a window onto the world; the
phones run it. The single exception is a debug menu hidden behind the `d` key
(`src/host/debug.ts`), which lists every task so a grown-up can look at one out
of order; it is not part of the game, and no other key on the TV does anything
at all.

**A blob called Daddy gets that menu on its phone** (`src/host/game/grownup.ts`),
which is the same two director functions reached from the sofa rather than from
a keyboard nobody has plugged in. What the "no phone can reach it" rule was
protecting is intact: the host still owns everything, the two functions do
exactly what the director does to itself, **the host grants the privilege and
the phone never claims it** — commands from a blob the host did not name Daddy
are dropped, and the socket decides who is speaking rather than the payload.
**It is a secret from the children, and the secret is the whole of the
protection**: nothing in any UI, on any phone, on the TV, or in the page a
phone is served may hint that it exists. The sheet is built at runtime when
`grownup` arrives and is in no markup; it is never rendered greyed or disabled
on a phone that does not have it, because a disabled item is an advertisement;
the join screen behaves identically for every name; and the word `Daddy` lives
in the **host** rather than in `shared`, so it never ships to a phone at all.
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

**One world, ever.** A deployment serves exactly one host and one world; there is no concept of multiple rooms and there never will be. The relay holds the current host socket, its players, and the current session code in plain server memory.

**No persistence.** If the pod restarts, everyone rejoins. This means **exactly one replica** — never scale the Deployment.

## Decisions already made (don't relitigate)

- **pnpm workspaces**, not npm/yarn. `pnpm-workspace.yaml` at the root.
- **Web, not native Android apps.** QR code on TV → phones scan it once to find the address → in. Native wrappers are a packaging concern for later.
- **WebSockets via a relay, not WebRTC.**
- **Phaser 4**, the open-source npm library. NOT Phaser Editor (paid), NOT Phaser Game Agent (cloud credits). Phaser is just a dependency.
- **Single Vite build, multi-page mode.** Two HTML entries (`index.html` for players, `host/index.html` for the host) → one `dist/`. Vite code-splits per entry, so Phaser never ships to phones.
- **Plain Node server (`node:http` + `ws` + `sirv`), NOT TanStack Start.** Rationale: Start's WebSocket story is unreliable (h3 v2 / srvx don't do the upgrade cleanly as of mid-2026), we have no SSR or server-function needs, and the server is ~150 lines of relay. Don't introduce Express/Fastify/Hono either unless there's a concrete need.
- **Plain TypeScript + DOM for the player UI** by default. React (via Vite, *not* Start) is acceptable later if the player screens get fiddly. The host is Phaser and needs no UI framework.
- **A 4-letter session code, negotiated on the socket.** It names the world the current TV is running so that a phone can tell one world from the next — nothing more. It appears in **no URL**, nobody reads it, nobody types it and no QR code carries it: the relay mints one every time a TV attaches and tells whoever connects. A phone holding a different one held an identity from a world that is gone, so it drops that identity and comes back as a new player, keeping its name and its picture. **Multiple rooms are strictly out of scope**, and so is any way of choosing a world.
- **The QR code carries the deployment's address and nothing else.** It is how a phone that has never been here finds the page; once it has, or once it is installed, opening the app is the whole of joining. There is no scan step to get in.
- **Players get a persistent `playerId` in localStorage** so a refresh reattaches to the same blob.
- **A colour each, picked on the phone, and ten of them.** The palette comes from the TV — the phone opens its socket before joining and is sent every colour with the name of whoever has it — so the taken ones are greyed with that name and the world is the only thing that decides. Ten colours is therefore a hard cap of **ten blobs**: the eleventh phone waits with its name typed and gets in the moment somebody quits. That is the only queue in the game and it is a physical limit, not a round — no phone that is *in* ever waits for anything. **Names are unique too**, on the same terms: two blobs called Ivy are two labels a child cannot tell apart, and `sameName` in `shared` is what both ends compare with.
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
    shared/                 # message types + zod schemas, session-code helpers. Zero runtime deps except zod.
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
{ type: 'join',    playerId: string, name: string, colour: string }
//                                                              // the colour and the name are *asked for*, not
//                                                              // handed out: one blob each of both, and the
//                                                              // world grants or refuses. A `playerId` the
//                                                              // world already knows is exempt from both —
//                                                              // a blob may not be refused its own label.
{ type: 'input',   playerId: string, dx: number, dy: number }   // normalised -1..1, ~30/sec while touching, only on change
{ type: 'drawing', playerId: string, png: string }              // data:image/png;base64,... from canvas.toDataURL()
{ type: 'text',    playerId: string, value: string }            // cap ~60 chars
{ type: 'command', playerId: string, command: 'task', kind: string }
{ type: 'command', playerId: string, command: 'restart' }       // the grown-up's two buttons. Kept out of
//                                                              // `ServerToHostMessageSchema` for the reason
//                                                              // `session` is: that union is the game model's
//                                                              // input type, and this is a grown-up reaching for
//                                                              // `askFor` and `setLevel`, which `main.ts` calls
//                                                              // directly, exactly as `debug.ts` does.
{ type: 'finish',  playerId: string }                           // "I'm done — forget me." The host deletes the
//                                                              // blob outright, drawing and all; nothing is sent
//                                                              // back. NOT `left`: a phone that has merely gone
//                                                              // quiet leaves its blob standing there waiting.
//                                                              // A blob can never be renamed — the phone throws
//                                                              // its own identity away at the same moment and
//                                                              // comes back, if it comes back, as somebody new
//                                                              // in whatever colour they pick.

// host → player
{ type: 'assigned', colour: string, slot: number, hasDrawing: boolean }
//                                                              // also the phone's cue to show its controller.
//                                                              // hasDrawing false = "I haven't got your picture";
//                                                              // the phone keeps the last one it sent and re-sends it.
{ type: 'palette', colours: [{ hex, name, takenBy: string | null }] }
//                                                              // every colour there is and who has it, which is
//                                                              // the whole of what a join screen is made of.
//                                                              // Sent to one phone the moment its socket
//                                                              // attaches, and to '*' whenever the roster
//                                                              // changes — an away blob keeps its colour, so
//                                                              // only joining, quitting and being forgotten
//                                                              // move it.
{ type: 'sound', cue: SoundCue }                                // make a noise. A closed set in `shared`:
//                                                              // pickup, deliver, mine, win, miss, level,
//                                                              // count, go, hit. Information exactly as a
//                                                              // brief is — a phone with its sound off plays
//                                                              // the same game — and the one signal that can
//                                                              // be private without bowing six heads.
{ type: 'grownup', tasks: [{ kind, title, playable }],
  level: number, maxLevel: number, score: number }              // the grown-up's sheet, and only ever to the one
//                                                              // blob the host decided was Daddy. `playable` is
//                                                              // exactly `present >= minPlayers`, which is what
//                                                              // `askFor` accepts — and deliberately not
//                                                              // `suits`, or the menu would lie.
{ type: 'refused', reason: 'colour' | 'name' | 'full' }         // that hello was not granted, and why. Its own
//                                                              // message rather than something the phone works
//                                                              // out from a palette, because a palette to '*'
//                                                              // can arrive while a join is in flight. A
//                                                              // refused phone goes back to the *join* screen.
{ type: 'brief', headline: string, detail?: string, colour?: string,
  emphasis?: string, tone: 'task' | 'win' | 'miss' | 'level' }  // what the world is asking for, echoed above the
//                                                              // joystick. Information, never an instruction: it
//                                                              // changes no screen and takes no tool away.
//                                                              // headline '' takes the strip down. `emphasis`
//                                                              // is a word *of the headline* to paint in
//                                                              // `colour`: "everybody go **green**".

// relay → host only
{ type: 'arrived', playerId: string }                           // a socket with nobody on it yet, so that the TV
//                                                              // can answer with the palette. NOT the mirror of
//                                                              // `left`: the game model has no case for it,
//                                                              // because there is no blob to hear about.

// relay → both roles (never sent by the host)
{ type: 'waiting' }                                             // no TV for you: wait and try again
{ type: 'session', session: 'ABCD' }                            // which world you have reached.
//                                                              // sent the moment a socket attaches, and
//                                                              // again to every phone when a TV takes
//                                                              // the world over. A phone that gets one
//                                                              // it does not match mints a new playerId
//                                                              // and reconnects as a new player; one it
//                                                              // does match is its cue to say hello.

// connection setup (query string on /ws)
/ws?role=host
/ws?role=player&playerId=...
```

No code in either query: which world a client has reached comes back from the relay, which is the whole of the negotiation.

Relay semantics:
- One host socket, full stop. A new host connection replaces the current one and **mints a fresh session code** (a TV that has reloaded has forgotten every blob, so there is no such thing as the same world coming back). Every phone still on a socket is told the new code where it stands, and comes back as a new player.
- A phone is never turned away for the code it is holding — it is told which world this is and works the rest out itself. The one refusal is that there is no TV yet.
- Player messages are forwarded to the host, tagged with `playerId`. Host messages carry a `to: playerId` (or `to: '*'`) and are forwarded accordingly.
- If the host disconnects, the world is torn down and players get a `{ type: 'waiting' }` so they show "waiting for TV".
- If a player connects, the host gets `{ type: 'arrived', playerId }` — a socket, not yet a blob — and answers it with the palette.
- If a player disconnects, the host gets `{ type: 'left', playerId }`.

## Server (packages/server)

- Node 22, `node:http`. Routes: `GET /healthz` → 200; `GET /version` → the build string the web build wrote to `web/dist/version.txt`, `no-store`; `Upgrade` on `/ws` → `ws` server; everything else → `sirv('../web/dist', { single: false })` so `/host/` resolves to `host/index.html`.
- Static cache headers: hashed `/assets/*` are `immutable`, everything else (both pages, the worker, the manifest) is `no-cache`. A phone holding a stale page across a deploy is the one thing the service worker exists to prevent, so nothing but a hashed filename may be kept without asking.
- `relay.ts` exports a `createRelay(mint?)` that takes no I/O — it's a pure single-world registry (one host slot, a `Map` of players, the current session code) with `attachHost`, `attachPlayer`, `route(msg)` etc. No `Map` of rooms. The session-code generator is injected so tests get codes they can predict. `server.ts` wires sockets to it. This split is what makes it testable without real sockets.
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
- Session-code generator: length, charset, no ambiguous chars (0/O, 1/I).

**`server`** — unit tests on `relay.ts` (no sockets) + one integration test with real sockets.
- Unit: attach host mints a session and announces it; attach two players, route a player `input` → host receives it with `playerId`; host `to: '*'` fans out; host disconnect tears down the world; a second host replaces the first, mints a new session and tells every phone still on a socket; a phone is let in whatever code it was holding; player connecting before any host rejected.
- Integration (`index.test.ts`): start the real server on port 0, connect real `ws` clients as host + 2 players, assert end-to-end forwarding and that `/healthz` is 200. One test, kept fast.

**`web` — host game model** (`src/host/game/`). This is the important one.
- The game model is **pure TypeScript with no Phaser imports**: `createGame()`, `applyMessage(state, msg)`, `tick(state, dtMs)`, plus selectors. Phaser scenes only read from it and push messages into it.
- Vitest (node environment, no jsdom needed): join spawns a player at a sane position; input then `tick` moves them by `velocity * dt`; world bounds clamp; `text` creates a bubble that expires after N ms of ticks; `drawing` sets a skin key and a fresh key on every redraw; a second `join` from a known `playerId` keeps everything it had; the colour and the name asked for are granted when free and refused with a reason when not, and a blob is never refused its own; `finish` deletes the player, its drawing and its name and puts its colour back on the palette; `left` marks the player away and keeps both.
- **Phaser itself is not unit-tested.** It needs a canvas/WebGL and jsdom can't provide one. Keep the Phaser layer thin enough that it doesn't need to be. The same goes for the debug menu's DOM: the keyboard is a pure function in `src/host/debugMenu.ts` and that is what has tests.

**`web` — player**
- The cue → oscillator spec as a pure lookup. The `AudioContext` itself is not unit-tested, for the same reason Phaser is not.
- Joystick maths (pointer position → normalised `{dx,dy}`, dead zone, clamp to unit circle) as pure functions, unit-tested.
- Message send throttling (only on change, max ~30/sec) as a pure function over a fake clock, unit-tested.
- DOM wiring is covered by e2e, not unit tests.

**e2e (`/e2e`, Playwright)** — runs against `pnpm build && pnpm start`.
- One browser context opens `/host/`. The session is read off the `window.__game` test hook when a test needs it; nothing on the TV shows it and no URL carries it.
- Two more contexts open `/`, wait for the TV, type a name, tap a colour and join. That is the whole of getting in — and the join screen cannot be filled in before the TV answers, because the swatches *are* the palette it sent.
- A TV reload gives every phone a new identity under the same name, with nobody touching them.
- A phone that joins as Daddy opens the ☰ menu, finds one more line, picks sumo, and the TV is running sumo — alongside one that joins as somebody else and finds the menu holding nothing but Quit, with no trace of the sheet anywhere in its page.
- Assert: host shows two players with the right names; simulating a joystick drag on player 1 moves only player 1's sprite (assert via a `window.__game` test hook exposing model state on the host page — do not screenshot-diff Phaser); text from player 2 appears as a bubble; a drawing round-trips a PNG; a blob is redrawn mid-game without losing its place; a blob that finishes is forgotten by the TV and its phone comes back as somebody new, choosing again; a colour somebody has is greyed on every other phone with their name on it, and a name somebody has is refused in as many words; the room solves the simple task until the level rises and the world starts asking for a different one, which is played by driving into each other. That one climbs the ladder for real rather than poking the model, so it takes about a minute, and nothing may replace it with a shortcut.

  The tasks at the top of the ladder are covered too — sumo, and the crown taken by driving into whoever has it. Those unlock twelve and twenty-one solved tasks up, which is not a slow test but no test at all, so `askFor` in `e2e/world.ts` sets the level and puts tasks back until the director asks for the one wanted. It is the **only** thing in the suite that reaches past the UI, and everything after it is the real director, real joysticks and the real TV. Do not add a second such seam; do not use this one to skip the climb.
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

What is left is milestone 10. Milestone 11 is built and has no plan document
either; its entry below is kept only for the rules it decided by, which the
code obeys everywhere but states nowhere.

10. Android TV app: minimal native Kotlin WebView wrapper in `/androidtv`, leanback launcher entry, loads the host page remotely so it updates itself. Not Capacitor, not a browser. Target device is a Fire TV Stick 4K Max (Fire OS 7, Android 9, API 28); nothing Fire-specific. Planned in [`docs/android-tv.md`](docs/android-tv.md).
11. Objectives: something to actually do. Zones, then carryables; one task
    running at all times, procedurally parameterised and levelled up as the
    room gets good at them. Never rounds — no phone ever waits its turn.
    **All of it is built.** Fourteen tasks, in `src/host/game/objectives/`,
    each a file and a line in `registry.ts`: stand on the spot, the spot that
    runs away, hot potato, two to a pad, follow the lights, find your own pad,
    colour hunt, draw it, fetch, sorting, in order, a crate too heavy for one,
    sumo, and keep the crown. Underneath
    them: the seeded RNG, zones and pads, carryables, obstacles (walls a blob
    cannot drive through, which only hot potato uses — anybody standing where
    one appears is slid out over a few frames rather than teleported), the
    director and the ladder (`minLevel` gates what a room may be asked for, it
    never asks for the same thing twice running, and going up a rung queues
    whatever that rung unlocked to be played next — a level that unlocks
    something and then asks for the same old spot has not visibly done
    anything; a queued task the room is too small for waits for another blob
    rather than being dropped), marks worn beside a blob's
    name — never over its middle, which is where the child's own drawing is —
    `barge` for the one task that is about shoving, the `brief` message with
    per-phone lines, and the banner, timer, floor and score on the TV.

    Two of them are shaped by the floor rather than by a rule: **find your own
    pad** paints one pad per colour of blob in the room, so the answer is on the
    floor for anybody who cannot read the brief (blobs sharing a colour share a
    pad), and **fetch** brings things back to a house rather than a spot, with a
    number written on it instead of the delivered parcels — a heap of blocks on
    one spot said less than a numeral does.

    Between one task and the next there is a **breather** (`INTERLUDE_MS`, and
    a longer `LEVEL_UP_INTERLUDE_MS` when a rung has just been climbed). It is
    not a gap in play — every phone can still drive, talk and draw right
    through it — but it is long enough that the room is told what is coming:
    the last `COUNTDOWN_MS` of it reads "Next game in 5s", counted in whole
    seconds so it costs one message a second and a child can say it along.
    A level takes the headline for itself with a `tone: 'level'` brief, which
    is the only line either screen ever draws bigger than the rest.

    Five rules hold across all of them and must keep holding. The code obeys
    them everywhere and says so nowhere, which is why they are here:

    - **A task can only ever change what the world is asking for**, never what
      a phone offers. Drive, say, draw and finish are live in every task, for
      everybody, throughout.
    - **A task is judged against whoever is present right now**, so a child who
      wanders off never leaves the others with something they cannot finish.
    - **Nobody is ever eliminated**, and no task may put a child in a state
      they cannot drive out of. Being shoved off the island is somewhere to
      drive back from, not a punishment.
    - **Failure barely exists.** Running out of time is not losing: the score
      only ever goes up, the level never comes down, and the banner is
      cheerful either way. The youngest player is three.
    - **The TV is the primary signal**, so that heads are up. Telling one phone
      something nobody else is told is a good trick and worth spending
      sparingly — a task that can only be understood by looking down is played
      with six bowed heads.

    `registry.test.ts` asserts what has to be true of every task; adding the
    fifteenth inherits it. The e2e for the two at the top of the ladder is
    described under Testing.

## Phaser notes (host)

- `new Phaser.Game({ type: Phaser.AUTO, width: 1280, height: 720, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [...] })`.
- **Arcade physics is deliberately not enabled.** The pure model owns every blob's position: `tick` integrates movement, clamps to the world bounds and separates overlapping blobs, and the scene's `update` calls `tick` then copies positions onto sprites. Two integrators would fight, and the model is the one that is unit-tested and that the e2e suite reads. If real physics is ever wanted (bounce, momentum, mass), it grows in `src/host/game/`, not in the Phaser layer — do not quietly turn arcade physics back on beside a model that is still moving things.
- Scenes: `preload` / `create` / `update`. The socket lives in `main.ts`, not the scene; messages go into the game model and the scene only draws it.
- Drawing: `this.textures.addBase64(key, png)`, then on the `addtexture-<key>` event call `sprite.setTexture(key)`.
- Names and speech bubbles are `this.add.text(...)` objects positioned relative to the sprite each frame; fade bubbles with a tween then `destroy()`.
- Verify Phaser 4 APIs against `node_modules/phaser/types/phaser.d.ts` if unsure; don't guess from Phaser 3 memory.

## Player notes

- Touch joystick: `nipplejs` or ~50 lines of pointer-event code. Send normalised `{dx, dy}`, throttled.
- A blob's name is **five characters at most** (`MAX_NAME_LENGTH` in `shared`), so that it never grows wider than the blob under it and a four-year-old finishes typing it. The join screen says so and the box will not take a sixth.
- Drawing: fixed-size canvas (256×256) that starts as the blob itself — the player's own colour, in the same rounded-square shape — so the guide is the shape rather than an outline on top of it. "Done" → `toDataURL('image/png')` → send.
  The **whole square** is drawable: a finger that carries on past the edge of
  the blob can see where it went, and the TV cuts the picture to the blob's
  rounded outline on the way in (`src/host/phaser/skin.ts`). Nothing on the
  phone clips the canvas, and nothing about the crop belongs on the phone.
  The phone keeps the last PNG it sent in localStorage and puts it back
  whenever an `assigned` arrives with `hasDrawing: false` — a world that has
  just been created has forgotten every picture, and the phones hold the only
  copies. The phone still never decides anything: the TV says what it needs.
- Wake Lock API to stop phones sleeping (may be unavailable without HTTPS — degrade gracefully).
- Mobile keyboards shift layout — test the Say sheet on a real phone early.
- The player page is an installable PWA: `public/manifest.webmanifest`, `public/sw.js` (hand-written, ~60 lines, network-first, no Workbox and no build plugin), icons generated from `public/icons/blob.svg` by `scripts/icons.mjs` and committed. **Only the player page** — the host page links no manifest and the worker never touches `/host/`.
- **What is being carried is themed** (`shared/src/themes.ts`): apples into a basket, bones to the dog, socks to the washing. A theme gives fetch and sorting their headline, the picture drawn over each thing and the picture on the house — the same game, funnier, and a good deal easier to understand without reading. The renderer keeps a glyph per carryable id, exactly as it keeps a tally per zone id. `SEQUENCES` is the same idea in an order: bread, cheese, bread.
- **The phone makes the noises, never the TV.** Cues come out of the model — `stepObjectives` returns `Sound[]` beside its briefs — and are worked out by looking at what *changed*, so a task earns its cues without reporting anything and nothing can repeat every frame. They are rate-limited to about one per phone per 250ms. The synth is `src/player/sounds.ts`: sixty lines of WebAudio, no files and no dependency, and it lives under `src/player/` because an `AudioContext` is a `window` and `purity.test.ts` would say so. A context must be woken inside a gesture, and the Join tap is that gesture; if it is still asleep the cues are dropped in silence, because nothing depends on being heard. There is a **mute switch in the ☰ menu**, remembered in storage.
- Over the joystick, on **one** phone in the room, the ☰ menu holds one dull extra line built at runtime when a `grownup` message arrives: pick any task, or start the ladder again (which asks first, exactly as Quit does). Nothing else about that phone changes — it drives, says things and draws like every other phone.
- There are three screens: `waiting` (no TV yet), `join` (a name and a row of ten swatches) and `play`. The socket opens on load, before anybody has typed anything, because the join screen is made of the palette and only the TV knows it — so the order is waiting → join → play. A phone that has played before has its name and its colour in storage and gets in with one tap; a phone that is already in *this* world walks straight back into its blob without being asked anything, which is what makes a reload, a wifi blip and a TV coming back all non-events. There is no scan screen and no QR reader on the phone — the code in the URL was the only thing one was ever for.
- **A blob cannot be renamed.** Over the joystick are Say, Draw and a **menu** (☰), and in the menu is **Quit**: quitting sends `finish` (the message keeps its name; the child reads "Quit"), and the phone then clears its name, its colour, its drawing and its `playerId` and goes back to the join screen, so starting again is a new blob picked from scratch rather than a new label on the old one. It is behind the menu because it is the one thing that undoes anything and no thumb should find it by accident. Nothing else on the phone ever throws anything away, and it asks before it does.
- Which world it is in comes back on the socket, not from the page it was opened at. On a `session` that does not match the one in storage, the phone mints a fresh `playerId` and reconnects — the relay tags what a phone says with the id its *socket* arrived under, so a new identity has to arrive on a new socket. Its name and its last drawing are kept: only the identity was stale.
- Staleness of the *build* is decided by one thing: `/version` against the page's own `__BUILD_VERSION__`, checked on every connect and whenever a new worker takes over. A mismatch reloads the phone — but only on the waiting screen, never mid-joystick (`src/player/updates.ts`, which is where that rule is unit-tested).

## How I want to work

- Small, runnable increments, one milestone at a time and in order.
- Tests alongside the code they test, written in the same change.
- Don't add dependencies beyond `phaser`, `ws`, `sirv`, `zod`, `nipplejs` (optional), a QR library, `vitest`, `playwright`, `tsx`, `esbuild` without asking.
- Keep the three packages cleanly separated; `shared` is the only cross-import.