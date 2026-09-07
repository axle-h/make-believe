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

## Where they came from

They are a rip of Puyo Puyo Tetris 2's sound effects, cut by
`art/sfx.py` in `~/projects/dr-rustario-vs-rustris/puyo-rusto`, and copied out
of that repo's `src/theme/`. Already trimmed, 44.1 kHz, under a third of a
second each; about 90 KB for all ten. This is a game for one family's
television.

| Here | There | Length |
|---|---|---|
| `0.ogg` | `sfx/lock.ogg` | 0.30 s |
| `1.ogg` | `sfx/settle.ogg` | 0.07 s |
| `2.ogg` | `sfx/move.ogg` | 0.09 s |
| `3.ogg` | `sfx/rotate.ogg` | 0.24 s |
| `4.ogg` | `sfx/hard-drop.ogg` | 0.33 s |
| `5.ogg` | `genesis/lock.ogg` | 0.21 s |
| `6.ogg` | `genesis/settle.ogg` | 0.13 s |
| `7.ogg` | `genesis/rotate.ogg` | 0.08 s |
| `8.ogg` | `snes/lock.ogg` | 0.15 s |
| `9.ogg` | `snes/hard-drop.ogg` | 0.09 s |

If one of them stands out as a menu noise rather than a landing, swap it:
there are more in the same three directories, and `pop-1`…`pop-4` in each theme
are longer but pitched, if ten landings ever turn out to sound too samey.

They are imported through Vite (`import bounce0 from './bounce/0.ogg?url'`) so
they are hashed and served `immutable`. The service worker needs no change —
it is network-first over the whole origin and caches them like anything else.
