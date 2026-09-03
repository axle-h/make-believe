/**
 * The noises a phone can make, as a closed set both ends agree on.
 *
 * Six children looking at a TV do not see a parcel land. A blip in their own
 * hand is the cheapest feedback in the game, and it is the one signal that can
 * be private without bowing six heads — you hear it without looking down.
 *
 * The *sound* is the phone's business: what each of these turns into lives in
 * `src/player/sounds.ts`, because an `AudioContext` is a thing a browser has
 * and the game model has none. All the world says is which one.
 */

export const SOUND_CUES = [
  /** You picked something up. */
  'pickup',
  /** Something you were carrying got where it was going. */
  'deliver',
  /** Something has been pinned to you: the potato, the crown, your turn. */
  'mine',
  /** The room did it. */
  'win',
  /** The clock beat them. Cheerful — nobody lost. */
  'miss',
  /** Up a rung. */
  'level',
  /** Three, two, one… */
  'count',
  /** …go. */
  'go',
  /** Something hit you. */
  'hit',
] as const

export type SoundCue = (typeof SOUND_CUES)[number]
