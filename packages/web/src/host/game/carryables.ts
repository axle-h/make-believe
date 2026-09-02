import { BLOB_SIZE } from './constants.js'
import { pointInBounds, type Rng } from './rng.js'
import { activePlayers } from './selectors.js'
import { clamp, type GameState, type Player, type World } from './state.js'
import { contains, type Zone } from './zones.js'

/**
 * Things on the floor that are not blobs. A **parcel** is picked up by driving
 * into it, rides along with whoever has it, and is put down where it is taken;
 * a **crate** is too heavy for one blob and only shifts while two of them are
 * leaning on it.
 *
 * There is no button for any of it. Picking up is touching, carrying is
 * driving, and putting down is arriving — which is the whole vocabulary a
 * three-year-old already has, and the reason none of this reaches the phones.
 */

export interface CarryableBase {
  /** Stable for the life of the objective; the renderer keeps its views by it. */
  id: string
  x: number
  y: number
  colour: string
  /** Where it has been delivered, if it has: a zone id. Home things stay put. */
  home: string | null
}

export interface Parcel extends CarryableBase {
  kind: 'parcel'
  /** Whoever is carrying it, or `null` if it is sitting on the floor. */
  carriedBy: string | null
}

export interface Crate extends CarryableBase {
  kind: 'crate'
  /** Who is leaning on it right now, for the renderer and for the brief. */
  pushedBy: string[]
}

export type Carryable = Parcel | Crate

/** How big each of them is, as a square centred on its position. */
export const PARCEL_SIZE = 44
export const CRATE_SIZE = 104

/** Fewest blobs it takes to shift a crate. Two is the whole point of a crate. */
export const CRATE_PUSHERS = 2

/** How fast a crate goes when it is being shoved, against a blob's own speed. */
const CRATE_SPEED = 200

/** A little slack on touching, so a brush past is enough to pick something up. */
const REACH_SLACK = 6

/**
 * One step of everything on the floor: parcels get picked up, carried and
 * dropped, and crates move if enough blobs are leaning on them.
 *
 * A parcel that has been delivered is finished with — it sits in its zone and
 * cannot be picked up again, so a room cannot undo its own work by driving
 * back through the depot.
 */
export function stepCarryables(state: GameState, carryables: Carryable[], dtMs: number): void {
  const present = activePlayers(state)
  const carrying = new Set(
    carryables.flatMap((thing) =>
      thing.kind === 'parcel' && thing.carriedBy ? [thing.carriedBy] : [],
    ),
  )

  for (const thing of carryables) {
    if (thing.kind === 'crate') shove(state, thing, present, dtMs)
    else carry(thing, present, carrying)
  }
}

/** Put a thing down where it stands, whatever was happening to it. */
export function drop(thing: Carryable): void {
  if (thing.kind === 'parcel') thing.carriedBy = null
}

/**
 * Deliver anything sitting in a zone it belongs in. `belongs` is what makes
 * fetch different from sorting: everything goes to the one depot, or each
 * colour goes to its own.
 */
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

/**
 * Somewhere to drop a handful of things: on the floor, off the walls, and out
 * of the zones they are meant to be brought to — a parcel that starts in the
 * depot is a parcel nobody got to carry.
 */
export function scatter(
  rng: Rng,
  world: World,
  count: number,
  avoid: readonly Zone[],
  size: number,
): { x: number; y: number }[] {
  const margin = size / 2 + BLOB_SIZE / 2
  const spots: { x: number; y: number }[] = []
  while (spots.length < count) {
    let spot = pointInBounds(rng, world, margin)
    // A few goes at missing the zones, then take what we have: a parcel that
    // starts already home is a shame, and a generator that can hang is not.
    for (let attempt = 0; attempt < 12; attempt++) {
      if (!avoid.some((zone) => contains(zone, spot.x, spot.y))) break
      spot = pointInBounds(rng, world, margin)
    }
    spots.push(spot)
  }
  return spots
}

/** Everything that has not been delivered yet. */
export function stillOut(carryables: readonly Carryable[]): Carryable[] {
  return carryables.filter((thing) => thing.home === null)
}

/** A parcel: picked up by touching, carried by driving, dropped by leaving. */
function carry(parcel: Parcel, present: Player[], carrying: Set<string>): void {
  if (parcel.home !== null) return

  if (parcel.carriedBy !== null) {
    const carrier = present.find((player) => player.playerId === parcel.carriedBy)
    // The phone went away, or the child finished with their blob. The parcel
    // stays exactly where it was let go of, for somebody else to find.
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

/**
 * A crate: it does not move for one blob, however hard they drive. Two of them
 * leaning on it move it by the average of what they are asking for, which
 * means two children have to agree on a direction — the purest "this needs
 * both of you" there is, and no new thing to learn.
 */
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
  // Its own width off the walls, rather than a blob's: a crate half off the
  // screen is a crate two children cannot get behind.
  const half = CRATE_SIZE / 2
  crate.x = clamp(crate.x + dx * CRATE_SPEED * seconds, half, state.world.width - half)
  crate.y = clamp(crate.y + dy * CRATE_SPEED * seconds, half, state.world.height - half)
}

/** Close enough to count as touching it, squarely rather than roundly. */
function touching(player: Player, thing: CarryableBase, size: number): boolean {
  const reach = (BLOB_SIZE + size) / 2 + REACH_SLACK
  return Math.abs(player.x - thing.x) <= reach && Math.abs(player.y - thing.y) <= reach
}
