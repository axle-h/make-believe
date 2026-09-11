import { BLOB_SIZE } from './constants.js'
import { pointInBounds, type Bounds, type Rng } from './rng.js'
import type { Player } from './state.js'

/** A blob is on a zone when its centre is. */

export interface ZoneBase {
  /** The renderer keeps views by it. */
  id: string
  x: number
  y: number
  colour: string
  label?: string
  labelSize?: number
  /** On the floor but not what the world is asking for this second. */
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

/** The house is its body; the roof is drawn above it and standing under the eaves is standing outside. */
export interface HouseZone extends ZoneBase {
  shape: 'house'
  width: number
  height: number
}

export type Zone = CircleZone | RectZone | HouseZone

/** A share of the body's width. */
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

export function blobsIn(zone: Zone, blobs: readonly Player[]): Player[] {
  return blobs.filter((blob) => contains(zone, blob.x, blob.y))
}

export function zoneReach(zone: Zone): number {
  if (zone.shape === 'circle') return zone.radius
  // Counting the roof all round over-reserves, which is the harmless direction to be wrong in.
  const height = zone.shape === 'house' ? zone.height + roofHeight(zone) : zone.height
  return Math.hypot(zone.width, height) / 2
}

/** Above 1 `roominess` fits `count` blobs comfortably; below it they have to shove. */
export function radiusFor(count: number, roominess: number): number {
  return Math.sqrt(Math.max(1, count) / Math.PI) * BLOB_SIZE * roominess
}

/** Gives up after a few tries and takes the last spot, so a generator can never hang. */
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
