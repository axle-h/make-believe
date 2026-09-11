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
 * A browser only starts a context inside a gesture, and most phones never see the join screen,
 * so the first touch anywhere must wake it. `play` wakes first too, which also catches a context
 * the OS suspended while the phone was locked. The phone makes every noise; the TV makes none.
 */

/** A blob's landing voice is its `slot`, which the host sends in `assigned`. */
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

const BOUNCE_GAIN = 0.35

export interface Speaker {
  wake(): void
  play(cue: SoundCue): void
  /** A muted speaker never makes a context at all. */
  muted: boolean
  slot: number
}

export function createSpeaker(make: () => AudioContext, muted: boolean): Speaker {
  let context: AudioContext | null = null
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
      } catch {}
    },
  }

  /** A landing that fails to decode stays `null`, and that blob lands in silence. */
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
        .catch(() => {})
    }
  }

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
