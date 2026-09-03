import type { SoundCue } from '@make-believe/shared'

/**
 * The noises, made on the phone out of two oscillators and an envelope.
 *
 * There are no audio files and no dependency: each cue is a short shape drawn
 * in `VOICES`, and `play` turns one into a beep. The whole thing is about sixty
 * lines because six children each holding a phone is already the loudest part
 * of the game.
 *
 * The spec is pure and the browser is not, which is the split worth keeping:
 * `voiceFor` is a lookup a test can read, and the `AudioContext` is not tested
 * for the same reason Phaser is not.
 */

export interface Voice {
  /** The shape of the tone. Square is a toy, sine is a bell. */
  wave: OscillatorType
  /** Hertz at the start and at the end: up is arriving, down is a shrug. */
  from: number
  to: number
  ms: number
  /** How loud, at the top of the envelope. Nothing here is ever loud. */
  gain: number
  /** A second note over the first, for the ones that should sound like news. */
  second?: number
}

/**
 * One shape per cue. They are told apart by direction more than by pitch —
 * something arriving goes up, something lost goes down — because a phone
 * speaker in a noisy room is not going to carry a melody.
 */
const VOICES: Record<SoundCue, Voice> = {
  pickup: { wave: 'square', from: 520, to: 780, ms: 90, gain: 0.16 },
  deliver: { wave: 'square', from: 660, to: 990, ms: 150, gain: 0.2, second: 1320 },
  mine: { wave: 'triangle', from: 300, to: 900, ms: 180, gain: 0.22 },
  win: { wave: 'square', from: 523, to: 1046, ms: 320, gain: 0.22, second: 1568 },
  miss: { wave: 'triangle', from: 420, to: 220, ms: 300, gain: 0.18 },
  level: { wave: 'square', from: 392, to: 1568, ms: 460, gain: 0.24, second: 784 },
  count: { wave: 'sine', from: 660, to: 660, ms: 90, gain: 0.16 },
  go: { wave: 'square', from: 880, to: 880, ms: 260, gain: 0.24, second: 1320 },
  hit: { wave: 'sawtooth', from: 240, to: 90, ms: 200, gain: 0.2 },
}

export function voiceFor(cue: SoundCue): Voice {
  return VOICES[cue]
}

/**
 * Make the noise. Silence is always an acceptable outcome — a context that
 * never woke up, a phone with its sound off, a browser that does not do this
 * at all — because nothing in the game depends on being heard.
 */
export function play(context: AudioContext, cue: SoundCue): void {
  if (context.state !== 'running') return
  const voice = voiceFor(cue)
  const at = context.currentTime
  const seconds = voice.ms / 1000

  const envelope = context.createGain()
  // A quick way up and a slow way down: anything else clicks.
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(voice.gain, at + 0.01)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  envelope.connect(context.destination)

  for (const [index, from] of [voice.from, voice.second].entries()) {
    if (from === undefined) continue
    const tone = context.createOscillator()
    tone.type = voice.wave
    tone.frequency.setValueAtTime(from, at)
    // The second note rides the first, so a chord bends with it.
    tone.frequency.linearRampToValueAtTime(from * (voice.to / voice.from), at + seconds)
    tone.connect(envelope)
    tone.start(at + index * 0.02)
    tone.stop(at + seconds)
  }
}
