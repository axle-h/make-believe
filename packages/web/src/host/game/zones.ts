import { BLOB_SIZE } from './constants.js'
import { pointInBounds, type Bounds, type Rng } from './rng.js'
import type { Player } from './state.js'

/**
 * A patch of floor that knows who is standing on it. Half the objectives need
 * nothing else: a spot to stand on, a pad each, a place to bring things.
 *
 * A zone is plain data — the renderer draws it and the model asks it questions
 * — and a blob is judged by its centre, which is the only rule a three-year-old
 * ever has to work out ("get your blob on it").
 */

export interface ZoneBase {
  /** Stable for the life of the objective; the renderer keeps views by it. */
  id: string
  x: number
  y: number
  colour: string
  /** Drawn on the floor when the pad means something on its own. */
  label?: string
  /**
   * Drawn faintly: it is on the floor, but it is not what the world is asking
   * for this second. The pads a chain of lights has not reached yet are dim,
   * and the one lit up is not — so which one to run at needs no reading at all.
   */
  dim?: boolean
}

export interface CircleZone extends ZoneBase {
  shape: 'circle'
  radius: number
}

export interface RectZone extends ZoneBase {
  shape: 'rect'
  width: number
  height: number
}

/**
 * A rectangle with a roof drawn on top of it — somewhere to bring things back
 * to. It is a house because "take it home" is a sentence a three-year-old
 * already understands and a circle on the floor is not; the roof is the whole
 * of the difference, and nothing about the shape is playable.
 *
 * The house *is* its body: the roof sits above it and standing under the eaves
 * is standing outside. Anything else would need the model to explain a shape.
 */
export interface HouseZone extends ZoneBase {
  shape: 'house'
  width: number
  height: number
}

export type Zone = CircleZone | RectZone | HouseZone

/** How far a roof rises above the body, as a share of the body's width. */
export const ROOF_RATIO = 0.42

export function roofHeight(zone: HouseZone): number {
  return zone.width * ROOF_RATIO
}

export function contains(zone: Zone, x: number, y: number): boolean {
  if (zone.shape === 'circle') {
    const gapX = x - zone.x
    const gapY = y - zone.y
    return gapX * gapX + gapY * gapY <= zone.radius * zone.radius
  }
  return (
    Math.abs(x - zone.x) <= zone.width / 2 && Math.abs(y - zone.y) <= zone.height / 2
  )
}

/** Everybody standing on this zone, in the order they were given. */
export function blobsIn(zone: Zone, blobs: readonly Player[]): Player[] {
  return blobs.filter((blob) => contains(zone, blob.x, blob.y))
}

/** How far from a zone's centre to its furthest edge, for keeping zones apart. */
export function zoneReach(zone: Zone): number {
  if (zone.shape === 'circle') return zone.radius
  // A house's roof only goes one way, but a reach is a radius: counting it all
  // round places the house a little further off the walls than it strictly
  // needs to be, which is the harmless direction to be wrong in.
  const height = zone.shape === 'house' ? zone.height + roofHeight(zone) : zone.height
  return Math.hypot(zone.width, height) / 2
}

/**
 * The radius a circle needs for `count` blobs to stand in it together.
 * `roominess` is how much elbow room they get: above 1 they fit comfortably,
 * below it they have to shove, which the collision code already makes funny.
 */
export function radiusFor(count: number, roominess: number): number {
  // Enough area for `count` squares, then scaled: the packing is loose because
  // blobs are square and children are not efficient.
  return Math.sqrt(Math.max(1, count) / Math.PI) * BLOB_SIZE * roominess
}

/**
 * Put a zone somewhere sensible: wholly inside the world, and clear of the
 * zones already placed. It gives up after a few tries and takes the last spot
 * rather than looping — a slightly close pair of pads is nothing, and a
 * generator that can hang is everything.
 */
export function placeZone(
  rng: Rng,
  bounds: Bounds,
  reach: number,
  placed: readonly Zone[],
  gap = BLOB_SIZE,
): { x: number; y: number } {
  const margin = reach + BLOB_SIZE / 2
  let spot = pointInBounds(rng, bounds, margin)
  for (let attempt = 0; attempt < 24; attempt++) {
    if (placed.every((zone) => Math.hypot(zone.x - spot.x, zone.y - spot.y) >= zoneReach(zone) + reach + gap)) {
      return spot
    }
    spot = pointInBounds(rng, bounds, margin)
  }
  return spot
}
