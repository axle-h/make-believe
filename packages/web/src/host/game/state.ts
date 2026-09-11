import { sameName } from '@make-believe/shared'
import { BLOB_SIZE, PALETTE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { createDirector, type Director } from './objectives/director.js'

/** The host owns all game state, here: only the model's own functions change it, and the renderer only reads it. */

export interface World {
  width: number
  height: number
}

export interface Bubble {
  text: string
  remainingMs: number
}

export interface Skin {
  /** The Phaser texture key; new on every drawing. */
  key: string
  png: string
}

export interface Player {
  playerId: string
  name: string
  slot: number
  colour: string
  x: number
  y: number
  dx: number
  dy: number
  /** The phone is gone but the blob stays, waiting for it. */
  away: boolean
  awayForMs: number
  bubble: Bubble | null
  skin: Skin | null
  skinCount: number
}

export interface GameState {
  world: World
  players: Map<string, Player>
  /** What the world asks for, never a mode a phone is in: every tool on every phone stays live. */
  objectives: Director
  /** Who was leaning on something last step, which makes a bounce an edge rather than a drone. */
  bumping: Set<string>
}

export function createGame(seed?: number): GameState {
  return {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    players: new Map(),
    objectives: createDirector(seed),
    bumping: new Set(),
  }
}

export function nextFreeSlot(state: GameState): number {
  const taken = new Set([...state.players.values()].map((player) => player.slot))
  let slot = 0
  while (taken.has(slot)) slot++
  return slot
}

export function spawnPosition(state: GameState, slot: number): { x: number; y: number } {
  const columns = 4
  const x = ((slot % columns) + 1) * (state.world.width / (columns + 1))
  const y = Math.floor(slot / columns) % 2 === 0 ? state.world.height / 3 : (state.world.height * 2) / 3
  return clampToWorld(state, x, y)
}

/** An away blob still holds its colour, since it is still on the floor waiting for its phone. */
export function claimColour(state: GameState, colour: string): boolean {
  if (!PALETTE.includes(colour)) return false
  return wearerOf(state, colour) === undefined
}

export function wearerOf(state: GameState, colour: string): Player | undefined {
  for (const player of state.players.values()) {
    if (player.colour === colour) return player
  }
  return undefined
}

export function namedAs(state: GameState, name: string): Player | undefined {
  for (const player of state.players.values()) {
    if (sameName(player.name, name)) return player
  }
  return undefined
}

export function clampToWorld(state: GameState, x: number, y: number): { x: number; y: number } {
  const half = BLOB_SIZE / 2
  return {
    x: clamp(x, half, state.world.width - half),
    y: clamp(y, half, state.world.height - half),
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
