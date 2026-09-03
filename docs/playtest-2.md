# Planned: after the second play test

Two children played it again and told us what to fix. This is those notes,
sorted into six milestones that each end with something you can put on the TV.

The order is not the order the notes came in. It is: **repair first** (a play
test with the broken bits fixed is worth more than one with two new games
bolted onto them), then **the way in**, then **the grown-up's remote** — which
is a tool for building everything after it — then **the noise**, then
**content**, because the new games want the sounds and the themes and neither
wants to be retrofitted.

Nothing here relaxes the five rules in `CLAUDE.md`. Where a note came close to
one, the decision is written down under it.

## Decisions taken before starting

- **Colours are picked, and the palette comes from the TV.** The phone opens
  its socket before joining, is sent the live palette, and shows the taken ones
  greyed with the name of whoever has them. The consequence is accepted: with
  no TV attached there is nothing to pick from, so the phone's screens become
  waiting → join → play rather than join → waiting → play.
- **Ten colours is a hard cap of ten blobs.** The eleventh phone waits with its
  name typed and gets in the moment somebody quits. It is the only queue in the
  game and it is a physical limit, not a round: no phone that is *in* ever
  waits for anything.
- **Losing your last life makes a blob fuzzy, never still.** A fuzzy blob keeps
  its joystick, stops being hittable, and stops being fuzzy the instant the
  task ends. This is the same shape as being shoved off the sumo island: a
  state you drive around in, not one you are let out of.
- **"Two to a pad" stays, becomes exactly two, and only runs in an even
  room.** A room of four liked it and a room of five did not. "Nobody on their
  own" let an odd room come out but made the rule invisible, so it goes: two on
  every pad, one pad per couple, and the world does not ask for it — or keep
  asking for it — unless the room can be halved.
- **Names are unique, and a blob called Daddy gets the debug menu.** The name
  rule is the colour rule: one blob each, refused the same way, and it is what
  makes "Daddy" mean one phone. The menu reaching a phone at all contradicts a
  sentence in `CLAUDE.md`, which is changed on purpose rather than bent — see
  14, where what that sentence was protecting is spelled out and kept. **It is
  a secret from the children**, so nothing in any UI — on any phone, on the TV,
  or in the page a phone is served — may hint that it exists.
- **The race's starting gate is a wall, not a frozen joystick.** "No false
  starts" is enforced by an obstacle across the mouth of the start pad, removed
  on GO. Every phone keeps every tool at every moment, which is rule one, and a
  child understands a gate without being told. Do not replace it later with
  ignored input.
- **Colour hunt keeps needing a new picture.** Reported as a bug, kept as it
  is: the task is the whole room drawing at once, and a room told it has
  already finished has been given nothing to do. What gets fixed is the half
  that really was wrong — the colour it asks for is written in that colour.

---

## The protocol, in full

Every message added across 13, 14 and 15, and — the part that is easy to get
wrong — **which union each one has to be added to**. There are five, they are
not interchangeable, and a message left out of one is silently dropped rather
than rejected loudly:

| Union | Who parses with it | What it is |
|---|---|---|
| `PlayerToHostMessageSchema` | the **server**, on every phone message | what a phone may say |
| `HostOutboundMessageSchema` | the **server**, on every TV message | what the TV may say, each entry carrying `to` |
| `HostToPlayerMessageSchema` | the **phone** | the same messages with `to` stripped off by the relay |
| `ServerToHostMessageSchema` | nothing — it is the **game model's** input type | what the world hears |
| `HostInboundMessageSchema` | the **TV socket** | everything that can arrive at the TV |

### The new messages

```ts
// player → host      PlayerToHost + HostInbound
{ type: 'join', playerId, name, colour: string }        // gains `colour` (13)
{ type: 'command', playerId, command: 'task', kind: string }   // (14)
{ type: 'command', playerId, command: 'restart' }              // (14)

// host → player      HostToPlayer + HostOutbound (the latter with `to`)
{ type: 'palette', colours: [{ hex, name, takenBy: string | null }] }   // (13)
{ type: 'refused', reason: 'colour' | 'name' | 'full' }                 // (13)
{ type: 'grownup', tasks: [{ kind, title, playable }],
  level, maxLevel, score }                                             // (14)
{ type: 'sound', cue: SoundCue }                                       // (15)

// relay → host       HostInbound only
{ type: 'arrived', playerId }                                          // (13)

// and one field on an existing message
{ type: 'brief', …, emphasis?: string }                                // (12.4)
```

### Three rules about where they go

- **`ServerToHostMessageSchema` does not change.** It stays exactly
  join / input / drawing / text / finish / left. `arrived` and `command` are
  deliberately kept out of it, for the reason `session` already is: it is the
  game model's input type, `apply.ts`'s `route()` switches exhaustively over
  it, and neither of these is something the *world* hears. `arrived` is a
  socket that has not said who it is yet; `command` is a grown-up reaching for
  `askFor` and `setLevel`, which `main.ts` calls directly, exactly as
  `debug.ts` does.
  - So `arrived` is **not** quite the mirror of `left` that it looks like.
    `left` is in that union because the model genuinely acts on it.
- **Every host → player message needs both halves.** `routeFromHost` does
  `const { to, ...rest } = message` and forwards the rest, so each one is
  written twice: once in `HostToPlayerMessageSchema` and once in
  `HostOutboundMessageSchema` as `…Schema.extend({ to: RecipientSchema })`.
  Forgetting the second means the server drops it and nothing says why.
- **The socket decides who is speaking, not the payload.**
  `routeFromPlayer` already does `{ ...message, playerId }` from the socket's
  own id. That is what makes 14 safe: a phone cannot claim to be Daddy's
  `playerId`, because the tag is not the one it sent.

### One correction to what 13 said

An earlier draft had a refused join answered with nothing but a fresh
`palette`, and the phone working out from it what had gone wrong. That is a
race: a `palette` broadcast to `'*'` can arrive while a join is in flight and
be read as a refusal. Hence `refused` above — explicit, unambiguous, and it
carries the sentence's reason rather than making the phone derive it. `full`
covers the eleventh phone in the same breath.

A phone that is refused goes **back to the join screen** with the reason under
the name box. It does not sit on waiting, which is where it goes today after
submitting a join.

---

## 12. What the play test broke

All repair, no new concepts. Five small changes, each its own commit.

### 12.1 Two to a pad, and exactly two

**Why.** It was good with four and no good with five. The task is fine; the
rule it was written with is not. "Nobody on their own" was chosen so that an
odd room could always come out — three to a pad counted — and the price of that
is a rule nobody can see: a pad with three on it is right, until it isn't. So
it becomes the rule a child would guess from the name, and the world only asks
for it when that rule can be satisfied.

**Work.**

- **Exactly two on every pad.** `everybodyPaired` becomes "every pad has
  exactly two blobs on it", which with one pad per couple is the same as saying
  everybody is in a two.
- **One pad per couple, exactly** — `present / 2`, and no cap. The current
  `Math.min(MAX_NAMED_PADS, …)` has to go: `MAX_NAMED_PADS` is 4, so a room of
  ten would be given four pads and asked to put ten blobs in twos on them,
  which cannot be done. Pairs never names a pad by its colour, so it is not
  what that cap is for; two pads the same colour is fine here.
- **The pad is sized so a third blob does not fit.** Capacity stays 2 and the
  roominess comes down (about `{ easy: 1.2, hard: 0.95 }`) so the rule is on
  the floor rather than only in the wording — the same trick "find your own
  pad" uses. A third blob shoving at the edge and not fitting is the game
  explaining itself.
- **A pad with its two goes bright**, and the rest stay `dim`. That already
  exists for the chain of lights, and it means the room can see how far along
  it is without anybody reading the count.
- **`ObjectiveTemplate` gains a predicate:**

  ```ts
  /**
   * Whether a room this size can be asked for this at all, beyond simply
   * being big enough. Checked when one is chosen and again while it runs:
   * a task that stops suiting the room is dropped, exactly as one the room
   * has emptied out of already is.
   */
  suits?(present: number): boolean
  ```

  `pairs` answers `present % 2 === 0`. `eligibleTemplates` consults it when
  choosing, and `run` consults it every step.

- **`minPlayers` becomes 4.** Two blobs and one pad is not a negotiation, and
  the smallest even room above that is four.

**A correction to the earlier draft of this section.** It argued for keeping
`minPlayers` at 3 and for checking evenness only when choosing, on the grounds
that a task already running copes with an odd room. That was true of "nobody on
their own" and is not true of "exactly two": five blobs and two pads is a task
the room cannot finish, so it has to be dropped rather than left up. Which
makes this the one place the standing rule — *a child who wanders off never
leaves the others with something they cannot finish* — is honoured by the
director rather than by the task.

**Dropping it mid-task needs a moment's grace.** `run` already abandons a task
without a word when the room falls below `minPlayers`, and this rides on that.
But a phone that goes quiet is marked away immediately, so a blip in the wifi
would otherwise flip the room odd and take the task down. It should have to
stay unsuitable for a second or so before anything happens.

**And what `askFor` does.** The debug menu and the e2e seam keep honouring
`minPlayers` and go on ignoring `suits` — a grown-up wanting to look at the
task with five blobs should get to look at it, even though the room cannot
finish it.

**Interaction with 12.2.** That section changes `makePads` to lay out fewer
pads rather than shrink them when the capacity will not fit. Pairs must not be
given fewer pads — its count is exactly half the room — so the choice has to be
the caller's: a flag for "this count is exact". In practice a pad for two is
small enough that it never triggers, but the two sections touch the same
function and the rule should be written down rather than discovered.

**Tests.** Exactly two counts and three on a pad does not; a room of four with
one pad holding both pairs is unfinished until they split; `pairs` is eligible
at four, six and ten and not at three, five or two; ten blobs get five pads; a
running task is dropped when the room goes odd, and not by a blob that flickers
away and back; and a `registry.test.ts` invariant that any task declaring
`suits` says yes to some room size at or above its `minPlayers`, so nothing can
quietly become unaskable.

### 12.2 Follow the lights is playable

**Why it went wrong.** `makePads` clamps a pad to its own square of floor
(`FILL` is 0.8 of the half-cell), so with four pads no pad can be bigger than
144px whatever `capacity` asked for. The task then wants *every blob present*
inside one of them at once: six 72px blobs need about 31,000px² of floor and a
109px pad has 37,000 — which, once the collision separation has had its say, is
not a small pad, it is an impossible one. On top of that the chain runs to six
lights and the time limit gets *shorter* as the chain gets longer.

**Work.**
- `makePads` honours `capacity` first: if the radius the capacity needs will not
  fit the cell, it lays out **fewer pads** rather than shrinking them. A pad
  nobody can all stand on is worse than a pad fewer. Dropping one is the
  caller's choice, not the default — see 12.1: pairs needs exactly half the
  room's worth of pads and must never be handed fewer.
- `followTheChain`: `ROOMINESS` up to about `{ easy: 2.2, hard: 1.6 }`,
  `LENGTH` down to `{ easy: 2, hard: 4 }`, and the time limit becomes
  *per light* (`length × perLight`) so a longer chain is not also a tighter one.
- `PADS` stops climbing with the level. Harder means a longer chain and less
  elbow room, not more pads to squint at.

**Tests.** A new invariant in `registry.test.ts` covering every task that
expects the whole room on one pad: generated at every level, for every room
size up to the cap, each such pad is at least `radiusFor(present, 1)`. Plus a
`followTheChain` test that the chain never exceeds four.

### 12.3 The crate is solid

**Why.** "Push it together" is the one task built on a thing being in the way,
and the thing is not in the way — blobs drive straight through the crate.

**Work.** After `shove` moves a crate, keep blobs out of it. `obstacles.ts`
already does exactly this for walls, including the slide-out for anybody
standing where one appears; export its per-rectangle worker and call it from
`stepCarryables` with the crate's own box. The order matters: the crate moves,
then blobs are separated, so a crate shoves a blob rather than swallowing it.

It works because of the slack already in `touching`: push-out separates to
exactly `(BLOB_SIZE + CRATE_SIZE) / 2` and `touching` reaches `REACH_SLACK`
past that, so a blob leaning on a face is still counted as a pusher.

**Parcels stay pass-through.** Driving into one is how you pick it up, and a
parcel you bounce off is a parcel a three-year-old cannot collect.

**Tests.** One blob driving flat out at a crate neither enters it nor moves it;
two do; a pusher stays in contact for the whole shove; a blob standing where a
crate arrives is slid out rather than left inside.

### 12.4 Colour hunt says its colour in colour

**Why.** "Everybody go green!" is written in the same white as everything else,
so the one word that is the whole instruction is the one word a child who
cannot read has no way to get at.

**Work.** `Brief` and `BriefMessage` gain an optional `emphasis: string` — a
word inside the headline to paint in `colour`. The schema refuses an `emphasis`
that is not in its own headline. A pure `splitHeadline(headline, emphasis)` in
`shared` returns the three parts; the TV lays them out as three `Text` objects
on one baseline, the phone wraps the middle in a span. It costs both ends about
ten lines and it is reusable — the themed games in 16 want the same thing for
"take the **apples** home".

**What stays exactly as it is: the new drawing.** A blob that already looks
green is deliberately not counted until it sends a *new* picture, and the
`before` / `skinCount` gate that does that is not a bug and is not going. The
task is everybody drawing at once, which is the only thing in the game that
gets six children looking down at the same moment and then all looking up
again; a room that is already the right colour and is told so has been given a
task it has already finished, and there is nothing to see. It matters more
after 13, not less — once children pick their own colours, a room could
genuinely start out all green.

**One thing that will be missed.** `director.ts`'s `wording(brief)` is what
decides whether a brief has changed and is worth sending, and it concatenates
headline, detail, colour and tone. `emphasis` has to go into it too, or a brief
that changes only which word is painted will never reach a phone.

**Tests.** The schema refusing a stray `emphasis`; a brief differing only in
`emphasis` counting as changed; `splitHeadline` over the
awkward cases (word at the start, word absent, word twice); the colour hunt
brief carrying its paint word as `emphasis` with `paintHex` as `colour`. The
existing test that a blob already wearing the colour must still redraw stays,
and gains a comment saying why, so the next play test does not re-report it.

### 12.5 The crown outlives the game

**Why.** Your note: it is hot potato with the arrows reversed, and one badge
that lasts thirty seconds is much like another. Keeping it between games is
what makes it a different thing — it stops being a token and becomes a title.

**Work.**
- `crown: string | null` moves onto the `Director`, not the objective. It is
  cleared when its wearer finishes or is timed out for good.
- `keepTheCrown.generate` starts with the standing wearer if they are present.
  At the end, the director's crown goes to whoever won it outright, or to
  whoever wore it longest.
- The scene draws director-level marks as well as the running task's, so the
  crown is on somebody's head all evening. Nothing is said about it on the
  phones between games — it is on the TV, which is the primary signal.
- Second and later crown games get a headline that names the target:
  "Take the crown off Ivy!".

**And a stale comment to fix while in there.** `objectives/types.ts` says a
`Mark` "is drawn *on* the blob rather than beside it". That has not been true
for some time — `worldScene.ts`'s `nameWithBadges` puts the badge in front of
the name, and says itself that the on-the-blob version was removed because it
covered the child's drawing. `CLAUDE.md` agrees with the code. Fix the comment:
an agent implementing the crown, the race's places or the dodge lives will read
it and put a badge in the wrong place.

**Tests.** The crown survives a task ending and the next task starting; a
crowned blob that quits leaves the crown with nobody; the next crown game
starts on the standing wearer; a crown game with no standing wearer picks one.

---

## 13. Pick your colour

The biggest change to getting in since the QR code, and the one that bounds
everything after it: ten colours, ten blobs.

### The palette

`BLOB_COLOURS` goes to ten. Each has to be a word a three-year-old owns and a
colour tellable from the others across a lit room, which is most of why ten is
the ceiling. The two new ones are **white** and **brown** (a light chocolate, so
it reads on the dark floor).

That collides with the floor palette, where `ZONE_COLOURS` also has a white and
`nameOfColour` checks the floor first — "yours is the white one" would be
ambiguous. **Rename the floor's white to "cream"**, which its hex `#f6f0e2`
actually is, and keep the two palettes' names disjoint.

`takeColour`'s wrap-around ("somebody has to share one") goes: past ten there is
no colour to hand out, and the world says so. `CLAUDE.md`'s line about a
quitting child coming back "in a new colour" needs rewriting at the same time —
they come back in whatever colour they pick.

`takeColour` itself becomes `claimColour(state, hex)`, returning whether it was
free, and **`GameState.nextColour` goes with it** — a cursor that walks round
the palette has no job once a child is choosing. That is a field off the state,
so `state.test.ts` and anything constructing a `GameState` in a test move with
it.

### Protocol

Three additions, all small:

```ts
// relay → host, symmetric with `left`
{ type: 'arrived', playerId: string }

// host → player
{ type: 'palette', colours: [{ hex: string, name: string, takenBy: string | null }] }

// player → host, gains a field
{ type: 'join', playerId, name, colour: string }
```

- The relay sends `arrived` when a player socket attaches, which is how the host
  learns a phone exists before it has a name.
- The host answers with `palette` to that phone, and sends `palette` to `'*'`
  whenever the roster changes — so an open join screen updates live, and the
  queued eleventh phone watches a colour come free.
- On `join`: if the colour is free it is granted and `assigned` comes back as
  today. If it went in the meantime, the phone gets `refused` with a reason and
  a fresh `palette`, and shows "Bo has that one now". The TV is still the only
  thing that decides anything; the phone only ever shows what it was told. See
  the protocol section above for why the refusal is its own message rather than
  something the phone works out.
- An **away** blob is still on the roster: it keeps its colour and its name
  until the world forgets it. `palette` therefore changes on join, on finish
  and on a blob being timed out — not when a phone merely goes quiet.

### Names are unique too

One blob per name, on the same terms as one blob per colour. Two blobs called
Ivy is two labels a child cannot tell apart, and from 14 onwards the name is
also the thing that opens the grown-up's menu, so it has to mean one phone.

It needs **no new message**. Every present blob has exactly one colour, so the
`takenBy` names strung across the palette *are* the roster — the join screen
can grey out a name as it is typed from the palette it is already holding.

- Compared case-insensitively, and the comparison lives in `shared` beside
  `normaliseName` as `sameName(a, b)` — "IVY" and "ivy" are the same label on a
  TV, and only the host may decide they collide.
- Refused exactly as a taken colour is: `refused` with `reason: 'name'` and a
  fresh `palette`. "Somebody is already called Ivy."
- **A phone reconnecting under its own `playerId` is exempt** — it already owns
  that name, and the check must not refuse a blob its own label.
- A phone that was away long enough to be forgotten can come back to find its
  name taken. It lands on the join screen and picks another, which is the same
  thing that happens to it about its colour.

### The phone

- The socket opens on load, so the screens become **waiting** (no TV yet) →
  **join** (name box and a row of ten swatches, taken ones greyed with the
  owner's name) → **play**.
- The chosen colour is remembered in `localStorage` beside the name, so a phone
  that has played before opens on its own colour pre-selected and one tap gets
  in — the installed-app path stays a single tap.
- **The three screens stay the same three** — `join`, `waiting`, `play` — and
  `updates.ts` keeps `waiting` as the only one safe to reload on. Only the
  order they are reached in changes, so nothing about the update rules moves.
- Full world: the join screen sits there with every swatch greyed and a line
  saying all ten blobs are out playing. It does **not** auto-grab a colour that
  frees up: a colour appearing under a resting thumb is worse than a child
  choosing. The swatch simply goes live.

**Tests.** Schemas for `arrived`, `palette`, `refused` and `join.colour`, each
in the unions the protocol section names; a relay unit test
that an attaching player is announced to the host; model tests that a free
colour is granted, a taken one refused with a fresh palette, an eleventh join
refused, and a quit frees a colour; a pure `choosableColours(palette, wanted)`
on the phone side; and the e2e suite's `join` helper rewritten to go through the
picker, with a new case for two phones reaching for the same colour and one
for two phones reaching for the same name.

---

## 14. Daddy mode

A blob called **Daddy** gets the debug menu on its phone: pick any task, and put
the ladder back to the start. It is the same two functions the TV's `d` key
already calls, reached from the sofa instead of from a keyboard nobody has
plugged in.

It comes here, before the sounds and well before the new games, because it is a
tool for building the rest: testing the maze at level 9 otherwise means playing
a room of children up to level 9, and the only shortcut today is the e2e seam,
which is not something a play test can use.

### This changes a written rule

`CLAUDE.md` currently says the debug menu "is not part of the game, **no phone
can reach it**". That sentence has to change, and it is worth changing
deliberately rather than quietly:

- What it was protecting is intact. The host still owns everything: `debug.ts`
  already notes that it holds no game state and calls two director functions,
  "both of which do exactly what the director does to itself when it starts a
  task of its own". A Daddy phone is a second door onto those same two
  functions, not a new way to change the world.
- **The host grants the privilege; the phone never claims it.** Commands from a
  blob the host did not name Daddy are dropped, and the grown-up's menu is only
  ever sent to the blob the host itself decided was Daddy. A phone that lies
  about who it is gets nothing, because it is not the phone that decides.
- The TV's `d` key stays exactly as it is.
- **It is a secret, and the secret is the whole of the protection.** Anybody
  who knows the name can take the controls, so nothing anywhere may hint that
  the name means anything. The name is unique from 13, so there is only ever
  one of them, and a grown-up who wants it back quits and takes the name.

### Protocol

```ts
// host → player, only ever to the blob the host has decided is Daddy
{ type: 'grownup',
  tasks: [{ kind: string, title: string, playable: boolean }],
  level: number, maxLevel: number, score: number }

// player → host
{ type: 'command', playerId, command: 'task', kind: string }
{ type: 'command', playerId, command: 'restart' }
```

- The task list comes *from* the TV, the same way the palette does — the phone
  is told what it may ask for and shows exactly that. `playable` is exactly
  `present >= minPlayers`, which is precisely what `askFor` accepts.
  - It deliberately does **not** take `suits` into account. `askFor` ignores
    `suits` on purpose (12.1) so that a grown-up can look at a task out of
    order, and the two must agree — a greyed row the host would have accepted,
    or a live row it refuses, is a menu that lies.
- The kinds stay in the host. `shared` knows nothing about objectives and must
  not start to, so the schema validates a bounded string and the host resolves
  it — with a lookup that returns `null` for an unknown kind rather than the
  throwing `templateFor`.
- `grownup` is re-sent when the roster changes, when the level changes, and
  when a task starts, so the sheet is never stale.
- `restart` puts the level back to 1 and the score to 0. There is no level 0 —
  the ladder starts at 1 — so "restart from the beginning" is what it means and
  what the button should say.

### The phone, and keeping it quiet

Behind the ☰ menu, beside Quit, one more item opening a sheet with the list of
tasks and a Restart button. Restart asks first, exactly as Quit does, because
it is the other thing on the phone that throws something away.

Nothing about the joystick, Say or Draw changes for a Daddy blob. It plays the
game like everybody else and has one extra sheet.

**Nothing about it appears anywhere else, ever.** Taken together these are what
make it a secret rather than a feature with a lock on it:

- The menu item and its sheet are **built at runtime when `grownup` arrives**,
  not shipped in `index.html`. Every phone is served the same page, so a sheet
  sitting in the markup is a sheet an older child finds by opening the page on
  a laptop. Nothing about it is in the HTML, and its CSS class says nothing.
- It is never rendered greyed, disabled or hidden on a phone that does not have
  it. A disabled item is an advertisement.
- **The join screen behaves identically for every name.** No hint that a name
  is special, nothing that changes as one is typed, and a name already in use
  is refused with the same sentence whatever it is — so a child who happens to
  type Daddy while Dad is playing learns only that somebody has that name.
- The label is dull. Not "Debug", not "Grown-up mode", not anything a
  six-year-old reading over a shoulder would want to look into.
- **The TV shows nothing.** A task asked for from the sofa starts exactly as
  the director's own choice would; no banner, no brief, no tone, no note. A
  restart is visible only as the level and score being back where they started,
  which is as quiet as it can be made.
- No sound cue in 15 marks it, and the mode is not mentioned on the join
  screen, the waiting screen, the host page, the QR card or the manifest.

This is a living-room secret rather than a boundary: anyone determined enough
to read the bundle will find it, and that is fine. What matters is that nothing
in front of a child points at it.

### The host, and where the word itself lives

`isDaddy(name)` goes in the **host** game model — not in `shared`, which was
the obvious place and is the wrong one. The phone never asks the question: it
has no opinion about who is Daddy, it simply builds a sheet if a `grownup`
message arrives. So the name need never ship to a phone at all, and the two
pages are separate Vite entries, so it will not.

That is the difference between a secret and a secret written on the thing it
opens. `sameName` and `normaliseName` stay in `shared`, because both ends do
need those.

Case-insensitive, and worth noting: five characters is exactly
`MAX_NAME_LENGTH`, so "Daddy" fits with nothing to spare, and "daddy" typed in
a hurry has to work.

**Tests.** `isDaddy` and its case folding; the host sends `grownup` to a Daddy
blob and to nobody else; a `command` from a non-Daddy blob changes nothing; a
`command` naming an unknown kind changes nothing; `task` puts that task up and
`restart` puts the level and score back; `playable` is false only where the
room is too small, and matches what `askFor` accepts for every task at every
room size. The sheet's DOM is e2e, and the e2e case is: a
phone joins as Daddy, opens the sheet, picks sumo, and the TV is running sumo —
alongside one that joins as somebody else and finds the ☰ menu holding nothing
but Quit, with no trace of the sheet anywhere in its page.

---

## 15. The phone makes a noise

**Why.** Six children looking at a TV do not see a parcel land. A blip in their
own hand is the cheapest feedback in the game, and it is the one signal that can
be private without bowing six heads — because you hear it without looking down.

**Work.**
- `{ type: 'sound', cue }` host → player, in both host-side unions, with a
  closed `SoundCue` set in `shared`: `pickup`, `deliver`, `mine` (something has
  been pinned to you — the potato, the crown, your turn to draw), `win`,
  `miss`, `level`, `count`, `go`, `hit`.
- The synth lives in `src/player/`, never under `src/host/game/` —
  `purity.test.ts` walks the model and fails on any `window.` or `document.`,
  and an `AudioContext` is both.
- No audio files and no dependency: `src/player/sounds.ts` is about sixty lines
  of WebAudio, each cue a short envelope over one or two oscillators.
- An `AudioContext` has to be resumed inside a gesture; the Join tap is that
  gesture. If it is still suspended, cues are dropped in silence.
- **A mute switch in the ☰ menu**, remembered in storage. Six phones beeping at
  once is a lot, and the off switch is worth having on the first day rather than
  the second play test.
- Cues come out of the model: `stepObjectives` returns `Sound[]` alongside its
  briefs, so they stay pure and testable, rate-limited to about one per phone
  per 250ms.

**Tests.** Cue emission from the model (delivering a parcel makes exactly one
cue for the carrier; a level-up makes one for everybody; nothing repeats every
frame); the rate limiter over a fake clock; the cue → oscillator spec as a pure
function. The `AudioContext` itself is not unit-tested, for the same reason
Phaser is not.

---

## 16. Themes and collecting

The collecting games are the ones the room liked. This makes them funnier and
adds the one you asked for.

### 16.1 Themed carryables

`shared/src/themes.ts`: a list of `{ things, glyph, home, homeGlyph }` — apples
into a basket, bones to the dog, fish to the cat, socks to the washing, letters
to the postbox, eggs to the nest, presents onto the sleigh, rubbish in the bin.
`fetch` and `sorting` take their headline, their parcel glyphs and their house
name from a theme picked at generation.

The renderer draws the glyph over the carryable square, keyed by carryable id —
the same machinery `zoneLabels` and `tallies` already use. With 12.4's
`emphasis` in hand, the headline says "Take the **apples** home!" in the
colour of the fruit.

### 16.2 In order

A new task (`inOrder.ts`): a themed sequence on the floor — the sandwich
(bread, cheese, bread), the snowman (big, middle, head), one two three — and one
house that shows what it wants next, large, which is the whole instruction.

The mechanism is nearly free: `deliverInto` already takes a `belongs`
predicate, so "only the next one in the sequence is accepted" is one function.
A parcel brought to the house out of turn is simply dropped where it stands with
a `miss` cue — not a penalty, not a reset, just not yet.

`minPlayers` 2, somewhere around level 6.

**Tests.** Three delivered in order finishes it; out of order does not advance
it and does not undo anything; a carrier who leaves drops what they had.

---

## 17. Four new games

Biggest last, and in this order: each one is a bigger new idea in the model than
the one before it, and each one hands the next something it needs.

### 17.1 The moving pad

One pad drifting slowly across the floor and bouncing off the walls; everybody
on it for a good long hold. The smallest of the four and the warm-up for the
rest.

The one new thing it needs is **something on the floor that moves**, which the
renderer currently assumes cannot happen — `renderFloor` only redraws when its
`floorFor` signature changes, so the signature has to take in the positions of
whatever is on it. Do that generally rather than for zones only: the race
straight after this moves obstacles, and it should not have to touch this again.

Pad big enough for everybody, per 12.2's invariant. `minPlayers` 2, on
whichever rung is emptiest when it lands.

### 17.2 The race

A wide start pad down the left, a finish pad down the right, and something in
the way. Everybody gathers on the start, then **3 — 2 — 1 — GO**.

**How it does not break the first rule.** "No false starts" sounds like holding
six joysticks still for three seconds, and rule one says drive is live in every
task, for everybody, throughout. So it is not a rule at all: **the start pad
has a gate**, an obstacle across its mouth, and the gate is removed on GO.
Every joystick works the whole time, a blob shoving at the gate is a blob doing
exactly what it should, and nobody can jump the gun because there is a wall
there. The floor explains it, which is how "find your own pad" and the
two-sized pad in 12.1 work too.

Obstacles already do all of this: they are solid, and anybody standing where
one appears is slid out over a few frames rather than teleported.

**The phases.**

- **Gathering**, with no clock at all: the countdown starts when everybody
  present is on the start pad. `ObjectiveBase` gains `clock: 'running' |
  'held'` and `run` only counts down while it is running — three lines, and the
  timer bar simply is not drawn while it is held.
  - Make it **optional, defaulting to running**. Every one of the twelve
    generators today spells out `zones`, `obstacles`, `marks` and `carryables`
    by hand, so a required field is a required edit to twelve files — and 17.4
    adds `hazards` on top. Either default them or add a small `baseObjective()`
    the generators spread, but do not quietly make all twelve churn.
  - With a patience cap, because "no time limit" means no pressure rather than
    an evening that can stall: after twenty seconds or so it counts down
    anyway, with whoever is on the pad. A child who has put the phone down is
    already excluded — `activePlayers` does that — but one who is present and
    dawdling must not be able to hold the room forever.
- **The countdown**: 3, 2, 1, GO, one second each, and it costs one message a
  second because `takeChangedBriefs` only ever sends what has changed. The
  `count` cue from 15 is exactly this, and GO wants its own.
- **The race**: the gate is gone, the clock starts.

**How it ends.** The first blob across is named — "Ivy got there first!" — and
the task is **done when everybody present has reached the finish**, not when
the first one has. That is what keeps a race inside the rules: the room is
racing the course, there is a winner in it, and the last child home still
finishes rather than being stopped. A blob that is home wears a mark beside its
name; running out of time is cheerful as ever.

**The obstacles, and later the moving ones.** One task, scaled by `difficulty`
the way everything else is: a clear course with a few blocks at first, and
higher up the ladder they move.

- **Bobbing**: a block sliding up and down its own line, eased so it hangs at
  each end — a sine is the whole of it, and it reads as bouncy rather than
  mechanical.
- **Rotating**: a bar turning slowly about its centre. This is the one that
  costs something. `Obstacle` gains an optional `angle`, and the separation in
  `obstacles.ts` has to work on an oriented box: put the blob's centre into the
  obstacle's own frame, treat it as a circle there, separate as now, and rotate
  the push back out. About thirty lines, forgiving by construction, and
  forgiving is the right way to be wrong for a four-year-old.
  - Not fudged as a row of little squares pretending to be a bar. The model is
    what the e2e reads and what the TV draws; the two must not disagree about
    where a wall is.
- **Being shoved by one.** A moving obstacle knows how far it moved this frame,
  so a blob caught inside is carried by that much first and separated
  afterwards — which is being pushed aside by a platform rather than being
  squeezed out of its near side. The tangential speed of a turning bar sweeps
  blobs along it, which is the joke. Cap it well below the shove in sumo.
- **Nothing may pin a child.** No moving obstacle travels within a blob's width
  of a wall, so there is always somewhere to be squeezed to, and no two of them
  overlap. A blob that cannot drive out of where it has been put is the one
  thing this must not do, and the course is what guarantees it rather than the
  push-out code hoping.

`minPlayers` 2 — one blob racing itself is a stopwatch. Low on the ladder,
since it needs no reading at all, and it gets its own harder version for free
as the level climbs.

**Tests.** The gate holds a blob driving flat at it and is gone on GO; the
clock does not move while it is held; the countdown says each number once; the
patience cap starts the race with a dawdler still off the pad; first across is
recorded and the task finishes only when everybody is home; a bobbing block
returns to where it started after a whole period; the oriented separation puts
a blob outside a bar at every angle it can be at; a blob standing where a
turning bar sweeps is moved along rather than through; and no generated course
puts a moving obstacle where it could pin a blob against a wall.

### 17.3 The maze

A small grid maze carved by a seeded recursive backtracker and emitted as
`Obstacle` rectangles — which already exist, are already solid, and already
slide a blob out of a wall that appears on top of it. Everybody starts at the
mouth, and a carrot sits at the end.

- **Done when anybody reaches the carrot**, not when it is carried back out. A
  three-year-old who gets there has won it for the room.
- Corridors are two blobs wide (about 150px), which on a 1280×720 floor gives
  roughly 8×4 cells at the top of the ladder.
- **A couple of loops are carved in** (knock out some fraction of the remaining
  walls). Six blobs and one true dead end is six blobs wedged in a corner, and
  the collision separation is not going to sort that out.

**Tests.** Every generated maze has a path from the mouth to the carrot (a
flood fill over the grid); every corridor is at least a blob and a half wide;
nobody starts inside a wall; the maze gets bigger with the level and never
bigger than the floor.

### 17.4 Dodge

Friendly things drift across the floor — tomatoes, raindrops, flying socks — and
a blob that is hit loses one of three lives. At zero it goes fuzzy: still
driving, no longer hittable, and no longer fuzzy the moment the task ends. The
room wins if anybody is still solid at the buzzer.

- New on `ObjectiveBase`: `hazards`, optional in the same way `clock` is
  (17.2), alongside `obstacles` and `carryables` —
  `{ id, x, y, vx, vy, size, glyph }`, stepped and culled off the floor. A task
  with none has an empty list and pays nothing, exactly as obstacles do.
- Lives are drawn as pips **beside the name**, never over the middle, which is
  where the child's own drawing is.
- A hit sends that phone a `hit` cue. This is the one place all evening where a
  private signal genuinely earns itself: you feel your own hit without looking
  down, and the TV still shows the room everything.
- A hit grants a moment's invulnerability, so one tomato cannot take all three.

**Tests.** Hazards move and are culled; a hit costs exactly one life and the
next frame's overlap costs nothing; a fuzzy blob still moves under `tick`; lives
are gone when the task is; the room wins while anybody is solid.

---

## How to work through this

For whoever picks this up, including a future me.

**One milestone at a time, in order, each landing as several small commits.**
12 is five independent repairs and they can go in any order among themselves;
13 through 17 depend on what is before them. Do not start two at once.

**Every commit leaves the repo green.** `pnpm typecheck`, `pnpm lint` and
`pnpm test` from the root, all passing, with the tests for a change written in
the same commit as the change. `pnpm test:e2e` needs browsers and a build, so
it runs at the end of a milestone rather than on every commit — but it must
pass before the milestone is called done, and it is the thing most likely to
break in 13, which rewrites how every phone gets in.

**Where things go.** New tasks are a file each in
`packages/web/src/host/game/objectives/` plus a line in `registry.ts`, and
their tests sit beside them. New shared vocabulary — themes, sound cues,
`sameName` — goes in `packages/shared/src/` and is exported from `index.ts`.
Nothing under `src/host/game/` may import Phaser or touch the DOM;
`purity.test.ts` enforces it and will tell you off.

**Two shapes to copy rather than invent.** A new task should read like
`onTheSpot.ts` (the simplest) or `keepTheCrown.ts` (one with marks, private
briefs and a note of its own). The renderer's per-id view maps — `zoneLabels`,
`tallies` — are the pattern for anything new that needs a Phaser object per
model thing.

**Ask before adding a dependency.** The list in `CLAUDE.md` is deliberate, and
nothing planned here needs anything outside it: the sounds are hand-written
WebAudio, the maze is thirty lines of recursive backtracking, and the emoji are
text.

**What "done" looks like for a milestone**: the tests it names all exist and
pass, `CLAUDE.md` has been updated for what changed (see the list below rather
than leaving it to the end), and it has been played on the TV with at least two
phones. The last of those is not optional — every note in this document came
from playing it, and none of them from reading it.

## The ladder, afterwards

Twelve tasks now, plus five: **seventeen**, with nothing removed. Each new one
takes the emptiest rung as it lands, so every milestone stays runnable. Then one
tidying commit at the end of 17 re-sorts every `minLevel` across all seventeen
and raises `MAX_LEVEL` from 8 to 10, so the difficulty scaling has somewhere to
spread and `registry.test.ts`'s "every task on exactly one rung" still holds.

The race wants a low rung — it needs no reading and it is the most obvious
thing in the game — and it is the one task that gets harder on its own as the
ladder climbs, so it should be laid out early and left there.

Level 3 keeps both of the tasks it unlocks. The moving pad in 17.1, which was
going to take the rung "two to a pad" left empty, now takes whichever rung is
emptiest after it.

## What this changes in CLAUDE.md

To be written as each milestone lands, not before:

- The message protocol gains `arrived`, `palette`, `refused`, `grownup`,
  `command`, `sound` and `join.colour`, and `brief` gains `emphasis`. The
  relay-semantics list gains the one about a phone being announced to the TV
  when its socket attaches.
- "Players get a persistent `playerId`" gains the colour beside it, and the
  quitting paragraph stops promising a new colour.
- The player-notes screens change order, and the ☰ menu gains a mute and, for
  one blob, a grown-up's sheet. The line about a five-character name gains the
  sentence that names are unique.
- The Testing section gains the new tasks' tests, and the note that the game
  model's message union deliberately does not carry everything the TV's socket
  receives.
- The debug-menu paragraph stops saying no phone can reach it, and says instead
  which phone can and why that is still the host deciding. Names join colours in
  the list of things there is exactly one of.
- The Phaser note that obstacles are used by hot potato alone stops being true,
  and obstacles gain a rotation and a motion.
- The milestone list gains 12–17, and the objectives section its new tasks —
  including the note that a crate is solid, a crown is not handed back, and that
  a task may now decline a room it does not suit as well as one it is too big
  for.
