import type { PhaseValue } from '@make-believe/shared'
import type { GameState, Player } from './state.js'

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

export function currentPhase(state: GameState): PhaseValue {
  return state.phase
}

/** Blobs whose phone is still holding a socket. */
export function activePlayers(state: GameState): Player[] {
  return players(state).filter((player) => !player.away)
}

export function playerCount(state: GameState): number {
  return state.players.size
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

export interface GameSnapshot {
  world: { width: number; height: number }
  phase: PhaseValue
  players: PlayerSnapshot[]
}

/**
 * The whole world as plain data. `state` holds a `Map` and live objects, which
 * do not survive the trip out of a browser page; this does.
 */
export function snapshot(state: GameState): GameSnapshot {
  return {
    world: { ...state.world },
    phase: state.phase,
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
  }
}
