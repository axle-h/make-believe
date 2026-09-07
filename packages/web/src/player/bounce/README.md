# The bounce voices

Ten short landing sounds, one per blob. A blob's voice is its **`slot`** — the
host already sends it in `assigned`, slots are 0–9, and there are ten colours —
so every blob in the room has a different voice, the same child in the same
colour gets the same voice back, and no protocol change was needed for any of
it.

**The phone plays its own blob's landing, and the TV plays nothing.** Six
phones around a sofa are the chorus, spread around the room instead of coming
out of the television, and a blob whose phone is muted is silent, which is
right.

These are the one exception to "no audio files and no dependency" in
[`../sounds.ts`](../sounds.ts). The nine cues there are still a synthesiser;
a synthesiser has nothing to say about the sound of something landing.

## They are generated, and here is why

Every one of them is built by
[`packages/web/scripts/bounce.mjs`](../../../scripts/bounce.mjs) — run by hand,
output committed, exactly as the PWA icons are. Do not edit the `.ogg`s;
change the table in the script and run it again.

The first attempt was ten *different* sound effects out of the rip, and
listening to them settled it: the three `lock` sounds — a piece landing — were
the only ones that read as a blob hitting something, along with
`genesis/settle`. `move`, `rotate` and `hard-drop` are menu noises with no
weight to them, and one of the `hard-drop`s had a bird in it.

So every voice is one of those four, and what makes ten of them is **pitch**.
That is the right axis anyway: a room tells its blobs apart by how high or low
each one lands, which is what "one voice each out of ten" asked for, and it
means no voice can turn out to be the wrong *kind* of sound. Resampling moves
speed along with pitch, which for a short percussive one-shot is exactly what
is wanted — a higher blob lands quicker.

| Slot | From | Pitch | Length |
|---|---|---|---|
| `0` | `sfx/lock.ogg` | as it is | 0.30 s |
| `1` | `genesis/lock.ogg` | × 1.22 | 0.18 s |
| `2` | `snes/lock.ogg` | × 0.84 | 0.18 s |
| `3` | `sfx/lock.ogg` | × 1.32 | 0.23 s |
| `4` | `genesis/settle.ogg` | × 0.86 | 0.15 s |
| `5` | `genesis/lock.ogg` | as it is | 0.21 s |
| `6` | `genesis/settle.ogg` | as it is | 0.13 s |
| `7` | `snes/lock.ogg` | × 1.26 | 0.12 s |
| `8` | `snes/lock.ogg` | as it is | 0.15 s |
| `9` | `sfx/lock.ogg` | × 0.80 | 0.38 s |

**And they are all levelled to the same peak.** The first set ran from −4.8 dB
to −28.7 dB, and twenty-four decibels across a room means the quiet blobs are
simply not heard beside the loud ones. Every voice is now peak normalised to
−6 dB, so a blob's landing is as loud as anybody else's and only its pitch
tells it apart. `genesis/settle` needed +22.7 dB of that, which is a lot to ask
of one sample — if slots 4 and 6 ever sound hissy beside the rest, that is why,
and the fix is to pick a different source for them rather than to turn them
down.

## Where they came from

A rip of Puyo Puyo Tetris 2's sound effects, cut by `art/sfx.py` in
`~/projects/dr-rustario-vs-rustris`, and read out of that repo's `src/theme/`.
About 90 KB for all ten. This is a game for one family's television.

They are imported through Vite (`import bounce0 from './bounce/0.ogg?url'`) so
they are hashed and served `immutable`. The service worker needs no change —
it is network-first over the whole origin and caches them like anything else.
