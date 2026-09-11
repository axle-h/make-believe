// The noises a phone can make. The world says which; what each sounds like is `src/player/sounds.ts`.

export const SOUND_CUES = [
  'pickup',
  'deliver',
  /** Something is pinned to you: the potato, the crown, your turn. */
  'mine',
  'win',
  'miss',
  'level',
  'count',
  'go',
  'hit',
  /** Drove into something. The one cue that differs per phone: a blob's landing voice is its `slot`. */
  'bounce',
] as const

export type SoundCue = (typeof SOUND_CUES)[number]
