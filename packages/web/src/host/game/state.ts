import { sameName } from '@make-believe/shared'
import type { Rgb } from './colour.js'
import { BLOB_SIZE, PALETTE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { createDirector, type Director } from './objectives/director.js'

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
  /**
   * Roughly what colour it came out, once somebody has looked. Reading pixels
   * needs a canvas and the model has none, so the renderer decodes the drawing
   * it is already turning into a texture and hands the answer back. `null`
   * until then, and `null` for a drawing nobody has got round to yet.
   */
  average: Rgb | null
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
  /**
   * What the world is currently asking everybody to do. It is a thing the
   * world wants, never a mode a phone is in: every tool on every phone is live
   * throughout, and a child who ignores it entirely is still playing.
   */
  objectives: Director
}

/**
 * A brand new world. The seed is injectable so that a test can say exactly
 * which spot appears where; the TV leaves it out and gets a fresh one, because
 * nothing survives a reload and every evening should be different.
 */
export function createGame(seed?: number): GameState {
  return {
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    players: new Map(),
    objectives: createDirector(seed),
  }
}

/** The lowest slot nobody is using, so a leaver's place on the floor is reused. */
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

/**
 * Is this colour one a blob may have, and is it going spare?
 *
 * Colours are asked for rather than handed out: a child picks one off a row of
 * swatches and the world grants it or says who has it. There is no wrapping
 * round the palette any more — past ten there is no colour to give, and the
 * world says so rather than sitting two children in the same blue.
 *
 * An **away** blob still holds its colour. It is still standing on the floor
 * waiting for its phone, and giving that away while it stood there would be
 * giving its blob away.
 */
export function claimColour(state: GameState, colour: string): boolean {
  if (!PALETTE.includes(colour)) return false
  return wearerOf(state, colour) === undefined
}

/** Whoever is wearing this colour, if anybody. */
export function wearerOf(state: GameState, colour: string): Player | undefined {
  for (const player of state.players.values()) {
    if (player.colour === colour) return player
  }
  return undefined
}

/** Whoever is already called this, if anybody. Case makes no difference. */
export function namedAs(state: GameState, name: string): Player | undefined {
  for (const player of state.players.values()) {
    if (sameName(player.name, name)) return player
  }
  return undefined
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
