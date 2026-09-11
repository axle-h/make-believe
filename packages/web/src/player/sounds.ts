import type { SoundCue } from '@make-believe/shared'

// No audio files and no dependency. `bounce` is a recording per slot, played by `audio.ts`.

export interface Voice {
  wave: OscillatorType
  from: number
  to: number
  ms: number
  gain: number
  second?: number
}

/** Told apart by direction, not pitch: arriving goes up, losing goes down. */
const VOICES: Record<Exclude<SoundCue, 'bounce'>, Voice> = {
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

export function voiceFor(cue: SoundCue): Voice | null {
  return cue === 'bounce' ? null : VOICES[cue]
}

/** Silence is always acceptable: nothing in the game depends on being heard. */
export function play(context: AudioContext, cue: SoundCue): void {
  if (context.state !== 'running') return
  const voice = voiceFor(cue)
  if (!voice) return
  const at = context.currentTime
  const seconds = voice.ms / 1000

  const envelope = context.createGain()
  envelope.gain.setValueAtTime(0, at)
  envelope.gain.linearRampToValueAtTime(voice.gain, at + 0.01)
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  envelope.connect(context.destination)

  for (const [index, from] of [voice.from, voice.second].entries()) {
    if (from === undefined) continue
    const tone = context.createOscillator()
    tone.type = voice.wave
    tone.frequency.setValueAtTime(from, at)
    tone.frequency.linearRampToValueAtTime(from * (voice.to / voice.from), at + seconds)
    tone.connect(envelope)
    tone.start(at + index * 0.02)
    tone.stop(at + seconds)
  }
}
