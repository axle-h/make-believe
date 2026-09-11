import type { PaletteEntry } from '@make-believe/shared'
import type { Carryable } from './carryables.js'
import type { Hazard } from './hazards.js'
import { BLOB_COLOURS, CROWN_BADGE } from './constants.js'
import type { Mark, Outcome } from './objectives/types.js'
import type { Obstacle } from './obstacles.js'
import { wearerOf, type GameState, type Player } from './state.js'
import type { Zone } from './zones.js'

/** Read-only views of the world, for the renderer and the e2e test hook. */

/** Slot order, so the TV never reshuffles itself. */
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

/** An away blob keeps its colour: only joining, quitting and being forgotten change this. */
export function palette(state: GameState): PaletteEntry[] {
  return BLOB_COLOURS.map((colour) => ({
    hex: colour.hex,
    name: colour.name,
    takenBy: wearerOf(state, colour.hex)?.name ?? null,
  }))
}

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
  text: string | null
  skinKey: string | null
}

export interface ObjectiveSnapshot {
  id: string
  kind: string
  headline: string
  remainingMs: number
  totalMs: number
  /** No bar is drawn while `held`. */
  clock?: 'running' | 'held'
  outcome: Outcome
  note: string | null
  zones: Zone[]
  obstacles: Obstacle[]
  marks: Mark[]
  carryables: Carryable[]
  hazards: Hazard[]
  /** Nobody is eliminated: these blobs are drawn faint, still drive, and cannot be hit. */
  fuzzy: string[]
  /** Drawn with a pulsing ring behind them. */
  danger: string[]
}

export interface DirectorSnapshot {
  level: number
  score: number
  streak: number
  /** The world's own marks beside a task's, i.e. the crown, which outlives its task. */
  marks: Mark[]
  /** `null` while the world is waiting for enough blobs to ask for anything. */
  objective: ObjectiveSnapshot | null
}

export interface GameSnapshot {
  world: { width: number; height: number }
  players: PlayerSnapshot[]
  objectives: DirectorSnapshot
}

/** Fields only, no template calls, so it is cheap to read every frame. */
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
            hazards: objective.hazards ?? [],
            fuzzy: objective.fuzzy ?? [],
            danger: objective.danger ?? [],
          },
  }
}

/** Not while keep-the-crown runs, which draws its own: two crowns on screen is a question nobody can answer. */
function standingMarks(state: GameState): Mark[] {
  const { crown, current } = state.objectives
  if (crown === null || current?.kind === 'keepTheCrown') return []
  if (!state.players.has(crown)) return []
  return [{ playerId: crown, badge: CROWN_BADGE }]
}

/** Copied, because `state` holds a `Map` and live objects that do not survive the trip out of the page. */
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
            hazards: structuredClone(objective.hazards),
            fuzzy: [...objective.fuzzy],
          },
  }
}
