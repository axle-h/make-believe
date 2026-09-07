import type { SoundCue } from '@make-believe/shared'
import bounce0 from './bounce/0.ogg?url'
import bounce1 from './bounce/1.ogg?url'
import bounce2 from './bounce/2.ogg?url'
import bounce3 from './bounce/3.ogg?url'
import bounce4 from './bounce/4.ogg?url'
import bounce5 from './bounce/5.ogg?url'
import bounce6 from './bounce/6.ogg?url'
import bounce7 from './bounce/7.ogg?url'
import bounce8 from './bounce/8.ogg?url'
import bounce9 from './bounce/9.ogg?url'
import { play } from './sounds.js'

/**
 * The phone's speaker: one `AudioContext`, woken whenever anybody touches
 * anything, and the cues played through it.
 *
 * It is a module of its own so that the waking can be tested. An
 * `AudioContext` is a `window`, so the context is injected — `main.ts` passes
 * `() => new AudioContext()` and a test passes a fake whose `state` it
 * controls.
 *
 * **A browser only starts a context inside a gesture**, and through the third
 * play test the only gesture we listened for was the Join tap. That is the
 * bug this exists to fix: a phone that has played before walks straight back
 * into its blob without being asked anything — session matches, hello, blob,
 * play screen — and never sees the join screen at all. Every phone after the
 * first reload, after a wifi blip, after the TV came back, and every installed
 * app opened a second time, which in a real evening is all of them.
 *
 * So `play` wakes first, every time. It is idempotent, `resume()` on a running
 * context costs nothing, and it is also what catches a context the operating
 * system suspended again while the phone was locked — nothing else ever would.
 *
 * Silence is always an acceptable outcome. A cue that arrives while the
 * context is still coming back is dropped without a word, because nothing in
 * the game depends on being heard.
 *
 * ## The bounce
 *
 * Every cue but one is a shape drawn by the synth in `sounds.ts`. `bounce` is
 * ten short recordings — a synthesiser has nothing to say about the sound of
 * something landing — and **which one a phone plays is its blob's `slot`**.
 * The host already sends that in `assigned`, slots are 0–9 and there are ten
 * colours, so every blob in the room lands differently, the same child in the
 * same colour gets the same voice back, and the host is still the one that
 * decided: the phone is only playing what it was told it is.
 *
 * The TV makes no noise at all, here as everywhere. Six phones around a sofa
 * *are* the chorus, spread about the room rather than coming out of the
 * television — and a blob whose phone is muted is silent, which is right.
 */

/** The ten landing voices, in slot order. See `bounce/README.md`. */
export const BOUNCE_URLS: readonly string[] = [
  bounce0,
  bounce1,
  bounce2,
  bounce3,
  bounce4,
  bounce5,
  bounce6,
  bounce7,
  bounce8,
  bounce9,
]

/** About the volume of the synth cues, which are all quiet on purpose. */
const BOUNCE_GAIN = 0.35

export interface Speaker {
  /** Make a context, or bring back one that has gone to sleep. */
  wake(): void
  play(cue: SoundCue): void
  /**
   * The ☰ menu's switch. A muted speaker never makes a context at all, which
   * is the point of it: no context, no waking, nothing.
   */
  muted: boolean
  /** Which blob this phone is, which is which landing voice it has. */
  slot: number
}

export function createSpeaker(make: () => AudioContext, muted: boolean): Speaker {
  let context: AudioContext | null = null
  /** Decoded once, the first time a context wakes; `null` until then. */
  let landings: (AudioBuffer | null)[] | null = null

  const speaker: Speaker = {
    muted,
    slot: 0,

    wake(): void {
      if (speaker.muted) return
      try {
        context ??= make()
        if (context.state === 'suspended') void context.resume()
        decodeLandings(context)
      } catch {
        // No WebAudio here at all. The game is played in silence, and plays
        // exactly the same.
        context = null
      }
    },

    play(cue: SoundCue): void {
      if (speaker.muted) return
      speaker.wake()
      if (!context) return
      try {
        if (cue === 'bounce') land(context, speaker.slot)
        else play(context, cue)
      } catch {
        // A context that has been closed or refused. Silence is fine.
      }
    },
  }

  /**
   * Fetch and decode the ten landings, once. Any that fails stays `null` and
   * that blob simply lands quietly — as does every blob until the decoding
   * finishes, which is a second at the start of an evening.
   */
  function decodeLandings(on: AudioContext): void {
    if (landings) return
    const decoded: (AudioBuffer | null)[] = BOUNCE_URLS.map(() => null)
    landings = decoded
    for (const [slot, url] of BOUNCE_URLS.entries()) {
      void fetch(url)
        .then((response) => response.arrayBuffer())
        .then((bytes) => on.decodeAudioData(bytes))
        .then((buffer) => {
          decoded[slot] = buffer
        })
        .catch(() => {
          // One voice missing is one blob that lands quietly.
        })
    }
  }

  /** This blob's landing, if it is decoded and there is anything to play it on. */
  function land(on: AudioContext, slot: number): void {
    if (on.state !== 'running') return
    const buffer = landings?.[((slot % BOUNCE_URLS.length) + BOUNCE_URLS.length) % BOUNCE_URLS.length]
    if (!buffer) return
    const gain = on.createGain()
    gain.gain.setValueAtTime(BOUNCE_GAIN, on.currentTime)
    gain.connect(on.destination)
    const source = on.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    source.start()
  }

  return speaker
}
