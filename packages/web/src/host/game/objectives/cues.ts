import type { Recipient, SoundCue } from '@make-believe/shared'
import type { Objective } from './types.js'

/**
 * The noises the world makes, worked out by looking at what changed.
 *
 * Nothing here asks a task to report anything: a cue is a *difference* between
 * one step and the next — a parcel that has just been picked up, a badge that
 * has just moved — which means adding the thirteenth task earns its cues for
 * free, and means nothing can repeat every frame by accident.
 *
 * The cue is all the world says. What it sounds like is the phone's business,
 * because an `AudioContext` is a thing a browser has and this has none:
 * `purity.test.ts` walks this directory and would say so.
 */

export interface Sound {
  to: Recipient
  cue: SoundCue
}

/** The little of an objective that a cue can be a change in. */
export interface CueSnapshot {
  /** Who was wearing something. */
  marks: string[]
  /** Each carryable's carrier, and where it had been delivered. */
  carriedBy: Record<string, string | null>
  home: Record<string, string | null>
}

const NOTHING: CueSnapshot = { marks: [], carriedBy: {}, home: {} }

export function cueSnapshot(objective: Objective | null): CueSnapshot {
  if (!objective) return NOTHING
  const carriedBy: Record<string, string | null> = {}
  const home: Record<string, string | null> = {}
  for (const thing of objective.carryables) {
    carriedBy[thing.id] = thing.kind === 'parcel' ? thing.carriedBy : null
    home[thing.id] = thing.home
  }
  return { marks: objective.marks.map((mark) => mark.playerId), carriedBy, home }
}

/**
 * What is worth a noise, given how things were a step ago.
 *
 * A delivery goes to whoever was carrying it a moment before, because
 * arriving is what puts a parcel down — by the time anybody looks, nobody is
 * holding it. A crate has no carrier at all, so its arrival is the room's.
 */
export function cuesFrom(before: CueSnapshot, objective: Objective | null): Sound[] {
  if (!objective) return []
  const sounds: Sound[] = []

  for (const thing of objective.carryables) {
    const held = thing.kind === 'parcel' ? thing.carriedBy : null
    if (held !== null && before.carriedBy[thing.id] == null) sounds.push({ to: held, cue: 'pickup' })
    if (thing.home !== null && before.home[thing.id] == null) {
      sounds.push({ to: before.carriedBy[thing.id] ?? '*', cue: 'deliver' })
    }
  }

  // Something has been pinned to somebody who was not wearing it before.
  for (const mark of objective.marks) {
    if (!before.marks.includes(mark.playerId)) sounds.push({ to: mark.playerId, cue: 'mine' })
  }

  return sounds
}

/**
 * How long one phone has to go without a noise before it may have another.
 *
 * Six phones beeping at once is a lot, and a blob dragged through a heap of
 * parcels should not sound like a fire alarm.
 */
export const CUE_GAP_MS = 250

/**
 * Who was last told to make a noise and when. `'*'` is a key like any other,
 * which is a simplification: a room cue and a private one in the same frame
 * both get through. That is one beep and one blip a quarter of a second, which
 * is the case the limiter is not for.
 */
export interface CueLimiter {
  lastAt: Record<string, number>
}

export function createCueLimiter(): CueLimiter {
  return { lastAt: {} }
}

/** The cues that may actually be sent, at this many milliseconds into the world. */
export function rateLimit(limiter: CueLimiter, sounds: Sound[], atMs: number): Sound[] {
  const allowed: Sound[] = []
  for (const sound of sounds) {
    const last = limiter.lastAt[sound.to]
    if (last !== undefined && atMs - last < CUE_GAP_MS) continue
    limiter.lastAt[sound.to] = atMs
    allowed.push(sound)
  }
  return allowed
}
