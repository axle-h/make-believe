import type { PaletteEntry } from '@make-believe/shared'
import type { Carryable } from './carryables.js'
import { BLOB_COLOURS, CROWN_BADGE } from './constants.js'
import type { Mark, Outcome } from './objectives/types.js'
import type { Obstacle } from './obstacles.js'
import { wearerOf, type GameState, type Player } from './state.js'
import type { Zone } from './zones.js'

/** Read-only views of the world, for the renderer and the e2e test hook. */

/** Every blob on screen, in slot order so the TV never reshuffles itself. */
export function players(state: GameState): Player[] {
  // The spread is already a copy, so sorting it in place mutates nothing.
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...state.players.values()].sort((a, b) => a.slot - b.slot)
}

export function playerById(state: GameState, playerId: string): Player | undefined {
  return state.players.get(playerId)
}

/** Blobs whose phone is still holding a socket. */
export function activePlayers(state: GameState): Player[] {
  return players(state).filter((player) => !player.away)
}

export function playerCount(state: GameState): number {
  return state.players.size
}

/**
 * Every colour there is, and who has it — the whole of what a join screen is
 * made of. Names rather than ids, because the phone shows "Bo has that one".
 *
 * An away blob is still on it: its blob is still standing on the floor waiting
 * for its phone, so its colour is not going spare. Only joining, quitting and
 * being forgotten for good change this.
 */
export function palette(state: GameState): PaletteEntry[] {
  return BLOB_COLOURS.map((colour) => ({
    hex: colour.hex,
    name: colour.name,
    takenBy: wearerOf(state, colour.hex)?.name ?? null,
  }))
}

/** A plain, serialisable copy of the world for the e2e test hook. */
export interface PlayerSnapshot {
  playerId: string
  name: string
  slot: number
  colour: string
  x: number
  y: number
  dx: number
  dy: number
  away: boolean
  /** What this blob is saying, or `null`. */
  text: string | null
  /** The texture key of this blob's drawing, or `null`. */
  skinKey: string | null
}

/** The running objective as plain data, for the renderer and the test hook. */
export interface ObjectiveSnapshot {
  id: string
  kind: string
  headline: string
  remainingMs: number
  totalMs: number
  /** `held` while the clock is not counting: no bar is drawn for one. */
  clock?: 'running' | 'held'
  outcome: Outcome
  /** What the TV says once it is over, or `null` while it is running. */
  note: string | null
  zones: Zone[]
  /** The walls this task has put on the floor, if any. */
  obstacles: Obstacle[]
  /** What the world has pinned to particular blobs — the potato, and later a crown. */
  marks: Mark[]
  /** The parcels and crates on the floor, if this task has any. */
  carryables: Carryable[]
}

export interface DirectorSnapshot {
  level: number
  score: number
  streak: number
  /**
   * What the *world* has pinned to a blob, over and above whatever the running
   * task has: the crown, which outlives the task that was played for it. The
   * renderer draws these beside a name exactly as it draws a task's own.
   */
  marks: Mark[]
  /** `null` while the world is waiting for enough blobs to ask for anything. */
  objective: ObjectiveSnapshot | null
}

export interface GameSnapshot {
  world: { width: number; height: number }
  players: PlayerSnapshot[]
  objectives: DirectorSnapshot
}

/**
 * What the world is asking for, as plain data. Nothing here calls into a
 * template: it is the fields on the objective and no more, so it is as cheap
 * to read every frame as it is to send out of the page.
 */
export function objectives(state: GameState): DirectorSnapshot {
  const director = state.objectives
  const objective = director.current
  return {
    level: director.level,
    score: director.score,
    streak: director.streak,
    marks: standingMarks(state),
    objective:
      objective === null
        ? null
        : {
            id: objective.id,
            kind: objective.kind,
            headline: objective.headline,
            remainingMs: objective.remainingMs,
            totalMs: objective.totalMs,
            ...(objective.clock === undefined ? {} : { clock: objective.clock }),
            outcome: objective.outcome,
            note: objective.note,
            zones: objective.zones,
            obstacles: objective.obstacles,
            marks: objective.marks,
            carryables: objective.carryables,
          },
  }
}

/**
 * What the world itself has pinned to a blob between one task and the next.
 *
 * Only the crown, and only when the room is not currently playing for it: the
 * game that plays for the crown moves it about as it goes, and two crowns on
 * screen at once is a question nobody can answer.
 */
function standingMarks(state: GameState): Mark[] {
  const { crown, current } = state.objectives
  if (crown === null || current?.kind === 'keepTheCrown') return []
  if (!state.players.has(crown)) return []
  return [{ playerId: crown, badge: CROWN_BADGE }]
}

/**
 * The whole world as plain data. `state` holds a `Map` and live objects, which
 * do not survive the trip out of a browser page; this does.
 */
export function snapshot(state: GameState): GameSnapshot {
  return {
    world: { ...state.world },
    players: players(state).map((player) => ({
      playerId: player.playerId,
      name: player.name,
      slot: player.slot,
      colour: player.colour,
      x: player.x,
      y: player.y,
      dx: player.dx,
      dy: player.dy,
      away: player.away,
      text: player.bubble?.text ?? null,
      skinKey: player.skin?.key ?? null,
    })),
    objectives: copyObjectives(objectives(state)),
  }
}

/**
 * `objectives` hands out the live zones, which is what the renderer wants; a
 * snapshot has to survive the trip out of the page, so this copies them.
 */
function copyObjectives(director: DirectorSnapshot): DirectorSnapshot {
  const objective = director.objective
  return {
    ...director,
    marks: structuredClone(director.marks),
    objective:
      objective === null
        ? null
        : {
            ...objective,
            zones: structuredClone(objective.zones),
            obstacles: structuredClone(objective.obstacles),
            marks: structuredClone(objective.marks),
            carryables: structuredClone(objective.carryables),
          },
  }
}
