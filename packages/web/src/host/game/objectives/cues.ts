import type { Recipient, SoundCue } from '@make-believe/shared'
import type { Objective } from './types.js'

// A cue is a difference between one step and the next, so no task reports anything and nothing
// repeats every frame. What it sounds like is the phone's business; `purity.test.ts` keeps audio out.

export interface Sound {
  to: Recipient
  cue: SoundCue
}

export interface CueSnapshot {
  marks: string[]
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

/** A delivery goes to whoever carried it a step ago, since arriving puts it down; a crate's is the room's. */
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

  for (const mark of objective.marks) {
    if (!before.marks.includes(mark.playerId)) sounds.push({ to: mark.playerId, cue: 'mine' })
  }

  return sounds
}

/** The shortest gap between two noises on one phone. */
export const CUE_GAP_MS = 250
export const BOUNCE_GAP_MS = 200

/** `'*'` is a key like any other, so a room cue and a private one in the same frame both get through. */
export interface CueLimiter {
  lastAt: Record<string, number>
}

export function createCueLimiter(): CueLimiter {
  return { lastAt: {} }
}

export function rateLimit(limiter: CueLimiter, sounds: Sound[], atMs: number): Sound[] {
  const allowed: Sound[] = []
  for (const sound of sounds) {
    const bounce = sound.cue === 'bounce'
    // Bounces keep their own budget so scraping along a wall cannot starve a delivery.
    const key = bounce ? `${sound.to}#bounce` : sound.to
    const gap = bounce ? BOUNCE_GAP_MS : CUE_GAP_MS
    const last = limiter.lastAt[key]
    if (last !== undefined && atMs - last < gap) continue
    limiter.lastAt[key] = atMs
    allowed.push(sound)
  }
  return allowed
}
