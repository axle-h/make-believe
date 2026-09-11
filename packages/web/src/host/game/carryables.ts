import { BLOB_SIZE } from './constants.js'
import { insideObstacle, pushOutOfBox, PUSH_OUT_SPEED, type Box } from './obstacles.js'
import { pointInBounds, type Rng } from './rng.js'
import { activePlayers } from './selectors.js'
import { clamp, type GameState, type Player, type World } from './state.js'
import { contains, type Zone } from './zones.js'

/** No button for any of it: touching picks up, driving carries and arriving puts down, so none of it reaches a phone. */

export interface CarryableBase {
  /** The renderer keeps its views by it. */
  id: string
  x: number
  y: number
  colour: string
  glyph?: string
  /** The zone id it was delivered to; a delivered thing stays put. */
  home: string | null
}

export interface Parcel extends CarryableBase {
  kind: 'parcel'
  carriedBy: string | null
}

export interface Crate extends CarryableBase {
  kind: 'crate'
  pushedBy: string[]
}

export type Carryable = Parcel | Crate

export const PARCEL_SIZE = 44
export const CRATE_SIZE = 104

export const CRATE_PUSHERS = 2

const CRATE_SPEED = 200

/** So a brush past is enough to pick something up. */
const REACH_SLACK = 6

/** A delivered parcel cannot be picked up again, so a room cannot undo its own work. */
export function stepCarryables(state: GameState, carryables: Carryable[], dtMs: number): void {
  const present = activePlayers(state)
  const carrying = new Set(
    carryables.flatMap((thing) =>
      thing.kind === 'parcel' && thing.carriedBy ? [thing.carriedBy] : [],
    ),
  )

  // The crate moves before blobs are pushed out of it, so it shoves a blob rather than swallowing one.
  const limit = PUSH_OUT_SPEED * (Math.max(0, dtMs) / 1000)
  for (const thing of carryables) {
    if (thing.kind === 'crate') {
      shove(state, thing, present, dtMs)
      // Separation leaves a pusher within `REACH_SLACK` of touching, so pushers stay pushers.
      for (const player of present) pushOutOfBox(state, player, boxOf(thing), limit)
    } else carry(thing, present, carrying)
  }
}

function boxOf(crate: Crate): Box {
  return { x: crate.x, y: crate.y, width: CRATE_SIZE, height: CRATE_SIZE }
}

export function drop(thing: Carryable): void {
  if (thing.kind === 'parcel') thing.carriedBy = null
}

/** `belongs` is the difference between fetch (one depot) and sorting (a depot per colour). */
export function deliverInto(
  carryables: Carryable[],
  zones: Zone[],
  belongs: (thing: Carryable, zone: Zone) => boolean,
): void {
  for (const thing of carryables) {
    if (thing.home !== null) continue
    const zone = zones.find((one) => belongs(thing, one) && contains(one, thing.x, thing.y))
    if (!zone) continue
    thing.home = zone.id
    drop(thing)
  }
}

/** Clear of walls and target zones where it can be; gives up after a few tries rather than hang. */
export function scatter(
  rng: Rng,
  world: World,
  count: number,
  avoid: readonly Zone[],
  size: number,
  walls: readonly Box[] = [],
): { x: number; y: number }[] {
  const margin = size / 2 + BLOB_SIZE / 2
  // Widened by the thing and a blob, so nothing is wedged where a blob cannot reach it.
  const clear = walls.map((wall) => ({
    ...wall,
    width: wall.width + size + BLOB_SIZE,
    height: wall.height + size + BLOB_SIZE,
  }))
  const spots: { x: number; y: number }[] = []
  while (spots.length < count) {
    let spot = pointInBounds(rng, world, margin)
    for (let attempt = 0; attempt < 12; attempt++) {
      const clash =
        avoid.some((zone) => contains(zone, spot.x, spot.y)) ||
        clear.some((wall) => insideObstacle(wall, spot.x, spot.y))
      if (!clash) break
      spot = pointInBounds(rng, world, margin)
    }
    spots.push(spot)
  }
  return spots
}

export function stillOut(carryables: readonly Carryable[]): Carryable[] {
  return carryables.filter((thing) => thing.home === null)
}

function carry(parcel: Parcel, present: Player[], carrying: Set<string>): void {
  if (parcel.home !== null) return

  if (parcel.carriedBy !== null) {
    const carrier = present.find((player) => player.playerId === parcel.carriedBy)
    // The carrier has gone, so the parcel stays where it was let go of.
    if (!carrier) {
      parcel.carriedBy = null
      return
    }
    parcel.x = carrier.x
    parcel.y = carrier.y
    return
  }

  const finder = present.find(
    (player) => !carrying.has(player.playerId) && touching(player, parcel, PARCEL_SIZE),
  )
  if (!finder) return
  parcel.carriedBy = finder.playerId
  carrying.add(finder.playerId)
  parcel.x = finder.x
  parcel.y = finder.y
}

/** Moves only for `CRATE_PUSHERS`, by the average of what they ask for, so they have to agree on a direction. */
function shove(state: GameState, crate: Crate, present: Player[], dtMs: number): void {
  if (crate.home !== null) {
    crate.pushedBy = []
    return
  }
  const pushers = present.filter((player) => touching(player, crate, CRATE_SIZE))
  crate.pushedBy = pushers.map((player) => player.playerId)
  if (pushers.length < CRATE_PUSHERS) return

  const dx = pushers.reduce((sum, player) => sum + player.dx, 0) / pushers.length
  const dy = pushers.reduce((sum, player) => sum + player.dy, 0) / pushers.length
  const seconds = dtMs / 1000
  // A whole crate off the walls, so two blobs can always get behind it.
  const half = CRATE_SIZE / 2
  crate.x = clamp(crate.x + dx * CRATE_SPEED * seconds, half, state.world.width - half)
  crate.y = clamp(crate.y + dy * CRATE_SPEED * seconds, half, state.world.height - half)
}

function touching(player: Player, thing: CarryableBase, size: number): boolean {
  const reach = (BLOB_SIZE + size) / 2 + REACH_SLACK
  return Math.abs(player.x - thing.x) <= reach && Math.abs(player.y - thing.y) <= reach
}
