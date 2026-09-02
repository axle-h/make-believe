import { BLOB_SIZE, PALETTE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'

/**
 * The world, as plain data. Nothing here knows about Phaser, the DOM or a
 * socket: `applyMessage` and `tick` are the only things that change it, and the
 * renderer only ever reads it.
 */

export interface World {
  width: number
  height: number
}

/** What a player is saying right now, if anything. */
export interface Bubble {
  text: string
  /** Milliseconds of ticks left before it disappears. */
  remainingMs: number
}

/** A drawing a player sent, ready for the renderer to turn into a texture. */
export interface Skin {
  /** Stable per drawing; the renderer uses it as the Phaser texture key. */
  key: string
  png: string
}

export interface Player {
  playerId: string
  /** What the phone called itself; drawn above the blob. */
  name: string
  slot: number
  colour: string
  x: number
  y: number
  /** Joystick vector, -1..1 on each axis. */
  dx: number
  dy: number
  /** True while the phone is gone. The blob stays, faded, waiting. */
  away: boolean
  /** How long it has been away, in milliseconds of ticks. */
  awayForMs: number
  bubble: Bubble | null
  skin: Skin | null
  /** Bumped on every drawing, so skin keys never collide across a session. */
  skinCount: number
}

export interface GameState {
  world: World
  players: Map<string, Player>
}

export function createGame(): GameState {
  return {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    players: new Map(),
  }
}

/** The lowest slot nobody is using, so a leaver's colour is reused. */
export function nextFreeSlot(state: GameState): number {
  const taken = new Set([...state.players.values()].map((player) => player.slot))
  let slot = 0
  while (taken.has(slot)) slot++
  return slot
}

/** Where a blob starts life: spread across two rows, well inside the walls. */
export function spawnPosition(state: GameState, slot: number): { x: number; y: number } {
  const columns = 4
  const x = ((slot % columns) + 1) * (state.world.width / (columns + 1))
  const y = Math.floor(slot / columns) % 2 === 0 ? state.world.height / 3 : (state.world.height * 2) / 3
  return clampToWorld(state, x, y)
}

export function colourForSlot(slot: number): string {
  return PALETTE[slot % PALETTE.length] as string
}

/** Keep a position inside the walls, allowing for the blob's own width. */
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
