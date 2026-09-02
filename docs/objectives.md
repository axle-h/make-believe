# Planned: objectives

Something to actually *do*. Right now the world is an empty floor: blobs drive
about, shove each other, talk and wear drawings, and that is the whole of it.
Objectives give the room a shared goal — "everybody stand on the red spot!" —
that the TV announces, the children solve together, and the world then replaces
with a slightly harder one.

Tasks are **well defined but procedurally parameterised**: a fixed set of
templates, each generating its own positions, sizes, counts and timings from a
seeded random number generator, scaled by a level that goes up as the room gets
good at them. Mostly cooperative, a few PVP, and several needing at least two
blobs to mean anything at all.

## Approach

### An objective is not a round

This is the rule everything else bends around. `CLAUDE.md` is emphatic that
nothing may put a phone into a mode or make it wait its turn, and objectives are
precisely the thing that erodes that. So:

- There is **always exactly one objective running**, it is always for everybody,
  and finishing one immediately generates the next. There is no lobby, no
  countdown to a start, and no gap in which a phone has nothing to do.
- An objective changes what the **world** is asking for. It never changes what a
  **phone offers**. Drive, say something, redraw: all three are live the whole
  time, in every task, for every player, exactly as they are today — and so is
  finishing with a blob and starting again as somebody new.
- A child who ignores the objective entirely and drives their blob round in
  circles is not doing anything wrong and the game must not tell them they are.

### Signal on the TV first

Everyone is in the same room looking at the same screen, and the game is better
when heads are up. So the primary signal is a **banner across the top of the
TV** — one short line, plus the target being visibly, obviously there on the
floor — and a **small strip above the joystick** on each phone echoing it, so a
child looking down is not lost. The strip is a line of text that appears and
disappears; it covers nothing, blocks nothing and is never tapped.

The phone becomes the *primary* channel only where a task is deliberately
asymmetric — "your pad is the green one, and nobody else knows that". That is a
good trick and it is worth spending sparingly, because a task that can only be
understood by looking at a phone is a task played with six bowed heads.

### Two new things in the world

Blobs are currently the only objects that exist. Two primitives carry the whole
catalogue:

- A **zone**: a circle or a rectangle on the floor, coloured, optionally
  labelled, that knows which blobs are standing in it. Perhaps forty lines in
  the model and a rectangle plus a label in Phaser. Half the tasks below need
  nothing else.
- A **carryable**: a thing a blob picks up by touching, which then follows it,
  and which can be dropped into a zone. The other half.

Zones come first and carryables come much later; the tasks are ordered so that
there is something worth playing long before anything is carried.

### Generation is seeded and pure

The model is pure TypeScript and unit-tested, so generation cannot reach for
`Math.random`. A small seeded PRNG (mulberry32, six lines) lives in the model and
is part of the state, which makes every generated task reproducible: a test can
assert that at level 4 this seed produces a 90px circle at a given point with an
eight-second hold.

A **level** is a number that scales parameters — radius down, timer down, count
up, extra rules switched on — and gates which templates are eligible. It is not
a screen, a menu, or anything a player navigates to. Nothing in the UI says
"Level 4" except, perhaps, a quiet number in a corner.

### Everything must be abandonable

Children wander off, phones lock, wifi drops. So:

- Every objective is time-boxed. If the timer runs out, it simply ends and the
  next one begins.
- An objective is always evaluated against **whoever is present right now**. A
  player leaving never makes one impossible to finish; a player joining halfway
  through is immediately part of it and is sent the current brief on join.
- If the room drops below a task's minimum number of blobs, that task is
  abandoned quietly and the world waits, showing "waiting for another blob"
  rather than a failure.

### Failure barely exists

The youngest player is three. Running out of time is not losing — the banner
says something cheerful, the objective changes, and the score does not go down.
Score only ever goes up. PVP tasks have a loser in the sense that somebody is
holding the potato when the buzzer goes, and that is funny rather than punitive:
nobody is eliminated and nobody sits out.

### No persistence, still

Score and level live in memory beside the rest of the world, and a TV reload
starts again at level 1 with a fresh seed. This is consistent with the standing
rule that nothing survives a restart, and with a game that is played for twenty
minutes at a time. Do not add storage for it.

## The model

Everything below is pure TypeScript under `packages/web/src/host/game/`. Phaser
reads it and draws it; it imports nothing.

```
game/
  rng.ts                seeded PRNG + helpers (pick, range, point in bounds)
  zones.ts              Zone, containment tests, non-overlapping placement
  objectives/
    types.ts            Objective, Brief, ObjectiveTemplate, GenerateContext
    director.ts         chooses, generates, steps, scores, levels up
    registry.ts         the templates, in level order
    onTheSpot.ts        one template per file, with its test beside it
    hotPotato.ts
    ...
```

State grows one field:

```ts
export interface GameState {
  world: World
  players: Map<string, Player>
  objectives: Director
}

export interface Director {
  level: number
  score: number
  /** Completions since the last level up. */
  streak: number
  rng: Rng
  current: Objective | null
  /** Counts down while a finished objective is still on screen. */
  interludeMs: number
}
```

An `Objective` is a discriminated union on `kind`, sharing `headline`,
`remainingMs`, `totalMs`, `zones` and `outcome` (`'running' | 'done' |
'expired'`), with each template adding its own working state — hold timers,
sequence position, who is "it", the secret assignments.

A template is a small record, which is what keeps adding the tenth task cheap:

```ts
export interface ObjectiveTemplate<T extends Objective> {
  kind: T['kind']
  /** Fewest present blobs for it to mean anything. */
  minPlayers: number
  /** The level at which it starts appearing. */
  minLevel: number
  generate(ctx: GenerateContext): T
  /** One step of this task. Sets `outcome` when it is finished. */
  step(objective: T, state: GameState, dtMs: number): void
  /** What each phone should be told. Recomputed only when it changes. */
  briefs(objective: T, state: GameState): Brief[]
  /** For the tasks that are about talking or drawing. */
  observe?(objective: T, state: GameState, message: ServerToHostMessage): void
}
```

`tick` gains one call, after movement and collisions, and returns what the
phones need to hear:

```ts
export interface TickResult {
  removed: string[]
  /** Emitted only when the wording actually changes, not every frame. */
  briefs: Brief[]
}
```

`applyMessage` hands each message to the current template's `observe` after
applying it, which is how "say the word" and "draw it" see what a phone sent
without any of that logic leaving the model.

### Getting a brief to a phone

The socket lives in `host/main.ts` and the clock lives in the scene, so
`startPhaser(parent, state)` grows an options argument with an `onBriefs`
callback that `main.ts` supplies and the scene calls after `tick` when the
result carries any. The scene still knows nothing about the socket, and
`main.ts` still owns it.

A phone that joins mid-task needs the current wording too, so a selector
`briefFor(state, playerId): Brief | null` is sent alongside `assigned` in the
existing join handler.

## The protocol

One new host→player message. It is information, never an instruction to change
screens:

```ts
{ type: 'brief',
  headline: string,          // <= 80 chars, '' clears the strip
  detail?: string,           // the private half, or a hint
  colour?: string,           // tints the strip when the task is about a colour
  tone?: 'task' | 'win' | 'miss' }
```

`HostToPlayerMessageSchema` gains it, and `HostOutboundMessageSchema` — which is
currently `AssignedMessageSchema.extend({ to })` — becomes a discriminated union
of `assigned` and `brief`, each extended with `to`. The relay forwards by `to`
and does not care which it is, so `relay.ts` needs no change beyond its tests
covering a `brief` fanned to `'*'`.

The player page gains one element: a strip above the joystick that shows
`headline`, `detail` underneath in smaller type, tinted by `colour`/`tone`. It
is never modal, never focusable, and never blocks the joystick.

## The tasks

Each lists what the generator varies. Everything varies with level as well:
timers shorten, zones shrink, counts rise.

### Zones only

**1. Everybody on the spot.** One circle appears; every present blob must be
inside it at once and hold for a few seconds. *Generated:* position, radius,
hold time. The radius scales down until they cannot all fit without shoving,
which the existing collision separation already makes funny. Needs two, needs no
new verb, and is the simplest thing that works — this is the first one built.

**2. Pairs.** Several coloured pads, each with room for exactly two blobs.
Everybody must be paired up and standing still. *Generated:* pad count from the
player count, positions, colours. Cooperative by construction and it makes them
negotiate out loud.

**3. Find your colour.** The same pads, but each blob is told privately which is
theirs — the first task that earns a phone-only brief. The harder variant tells
each child *somebody else's* pad, so they have to shout at each other to sort it
out, and the Say box starts doing real work.

**4. Follow the chain.** A sequence of pads lights one at a time; everybody must
be on the lit one before it advances. *Generated:* sequence length, positions,
seconds per step. Trivially scalable and legible to a toddler.

### The verbs the phone already has

**5. Draw it.** The TV privately tells one phone a thing to draw; everybody else
guesses through Say, and the host matches inbound text against the target. It is
Pictionary, and it is the best fit for what is already built — drawings are
already blob skins, so the guessers are looking at the drawer's blob. *Generated:*
prompt from a word list, whose turn it is. This one comes closest to a turn, so
it needs care: everybody else is still driving, talking and drawing throughout,
and the drawer is not "in" anything they have to leave.

**6. Colour hunt.** The TV names a colour and every blob must redraw itself
mostly that colour; the host samples the PNG's average colour and checks.
*Generated:* the target colour. Works for a three-year-old, has no turns at all,
and gets everybody drawing at once.

### Carryables

**7. Fetch.** Parcels scattered about, all of which must reach the depot before
the timer. *Generated:* count, positions, depot, time. Parallel, and the
youngest player can genuinely contribute.

**8. Sorting.** Coloured parcels, matching depots. One more rule on top of fetch.

**9. Too heavy for one.** A crate that only moves while two blobs are touching
it, moving by the average of their two joysticks. The purest "requires two
players" mechanic there is, and it forces real cooperation rather than parallel
work. If only one carryable task is ever built, build this one.

### PVP

**10. Hot potato.** One blob is "it", touching passes it on, and whoever holds it
at the buzzer takes the hit. Builds entirely on collisions that already exist —
no new primitive at all, and probably the cheapest fun in the list.

**11. Sumo.** A shrinking circle; blobs shove each other out of it. The
separation code nearly does this already and would want a push impulse to feel
right.

**12. Keep the crown.** A single pickup; score accrues while you hold it. Needs
carryables.

## Work

Five increments, each runnable and each worth playing on its own. 11a and 11b
are built; what they look like is in the code and the commit history, and the
list below is left as it was written so the shape of the rest still reads.

### 11a — the spine, and one task — **done**

- `game/rng.ts`: mulberry32 plus `pick`, `range`, `pointInBounds`; unit tests
  for determinism and range.
- `game/zones.ts`: `Zone` (circle and rect), `contains`, `blobsIn`, and
  placement that keeps zones inside the world and off each other.
- `game/objectives/`: `types.ts`, `director.ts`, `registry.ts`, and
  `onTheSpot.ts`. Director tests cover: generation only above `minPlayers`;
  completion raises score; three completions raise the level; timeout expires
  without lowering anything; a player leaving mid-task never blocks completion;
  dropping below `minPlayers` abandons quietly.
- `state.ts` gains `objectives`; `tick` steps the director and returns `briefs`;
  `selectors.ts` gains `briefFor` and puts the objective into `snapshot()` for
  the e2e hook.
- **`purity.test.ts` must be made to walk subdirectories** — it currently
  `readdirSync`s only its own directory, so everything under `objectives/` would
  escape the no-Phaser, no-DOM check.
- `shared`: the `brief` message, `HostOutboundMessageSchema` as a union, schema
  tests for both. `relay.test.ts` gains a `brief` fanned to `'*'`.
- Host render: zones under the blobs (a new depth below `DEPTH_BLOB`), a banner
  and a timer bar over everything. Thin, untested, consistent with the rest of
  the Phaser layer.
- `startPhaser` takes `{ onBriefs }`; `main.ts` sends them, and sends
  `briefFor` alongside `assigned` on join.
- Player: the strip above the joystick, and `brief` handled in `main.ts`.
- e2e: two players join, both drive into the circle, the objective completes and
  the score rises — asserted through `window.__game`, not pixels.

### 11b — a second task, and the ladder — **done**

- `hotPotato.ts`, using the collisions that already exist. It is PVP, so it
  proves the engine is not shaped only around cooperation.
- The director picks between eligible templates rather than always generating
  the same one; `minLevel` starts gating.
- The score and level get their quiet corner of the TV.

It also grew one thing the plan above did not name: a **mark**, a badge the
world pins to a particular blob and the renderer draws in the middle of it.
The potato is the first; the crown and whose turn it is to draw are the same
idea. It lives on `ObjectiveBase` beside `zones`, so the renderer draws it
without knowing which task put it there.

Two smaller decisions worth keeping: the director will not ask for the same
task twice running while anything else is eligible, and a template that has
something of its own to say about how it ended (who was left holding it) keeps
its own words instead of the generic cheer.

The e2e for it climbs the ladder rather than pretending to: two phones solve
"everybody on the spot" three times over, the level rises, hot potato turns up
on its own, and it is passed by driving one blob into the other. It costs
about a minute, which is the price of the ladder being real.

### 11c — pads, and the private brief

- `pairs.ts`, `findYourColour.ts`, `followTheChain.ts`.
- Per-player briefs: the same task saying a different thing to each phone. This
  is the first real exercise of `briefs()` returning more than one entry, and of
  a phone joining mid-task and needing its own line.

### 11d — talking and drawing as tasks

- `observe` on `applyMessage` wired up and tested.
- `drawIt.ts` with a kid-friendly word list in `shared`; matching that is
  forgiving about case, spacing and near-misses.
- `colourHunt.ts`, which needs average-colour sampling of a PNG. That cannot
  happen in the pure model — decoding needs a canvas — so the Phaser layer
  samples the texture it is already building and pushes a plain
  `{ playerId, r, g, b }` into the model. Keep the model side pure and tested;
  keep the sampling in `phaser/`.

### 11e — carryables

- `game/carryables.ts`: pick up on touch, follow the carrier, drop into a zone,
  and what happens when the carrier's phone goes away.
- `fetch.ts`, `sorting.ts`, `tooHeavyForOne.ts`.
- Host render for parcels and crates.

## Not doing

- Persisting score, level or anything else across a restart.
- Rounds, lobbies, ready-checks, turn queues, or any screen a phone must wait on.
- Eliminating a player, or any state a child can be put into that they cannot
  drive out of.
- A second world, a second host, or per-player difficulty.

## Done when

Four phones and a TV: the banner announces a task, the same line appears on
every phone, and the spot is plainly there on the floor. The children solve it
together, the TV says so, and a new and slightly harder one appears without
anybody touching anything. A phone that joins halfway through is told what is
going on. A child who puts their phone down does not stop the task from being
finished by the others. And at any point in any task, any phone can still drive,
say something, redraw its blob and finish with it.
