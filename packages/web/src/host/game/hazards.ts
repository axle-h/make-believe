import { BLOB_SIZE } from './constants.js'
import type { Player, World } from './state.js'

/**
 * Friendly things drifting across the floor that a blob would rather not be
 * hit by: tomatoes, raindrops, flying socks. They are not walls — nothing is
 * kept out of them and nothing is pushed by them — they simply cross the floor
 * and are gone, and being caught by one costs a life rather than a turn.
 *
 * A task with none has an empty list and pays nothing, exactly as obstacles
 * and carryables do.
 */

export interface Hazard {
  /** Stable while it is on the floor; the renderer keeps its views by it. */
  id: string
  x: number
  y: number
  /** Where it is going, in world units a second. */
  vx: number
  vy: number
  size: number
  /** What it is, drawn on it. */
  glyph: string
}

/** How far off the floor a thing gets before it is forgotten. */
const GONE_BY = 80

/** Everything on its way, moved — and whatever has left the floor, dropped. */
export function stepHazards(hazards: Hazard[], world: World, dtMs: number): Hazard[] {
  const seconds = Math.max(0, dtMs) / 1000
  for (const hazard of hazards) {
    hazard.x += hazard.vx * seconds
    hazard.y += hazard.vy * seconds
  }
  return hazards.filter(
    (hazard) =>
      hazard.x > -GONE_BY &&
      hazard.y > -GONE_BY &&
      hazard.x < world.width + GONE_BY &&
      hazard.y < world.height + GONE_BY,
  )
}

/** Whether this thing has caught that blob, squarely rather than roundly. */
export function catches(hazard: Hazard, player: Player): boolean {
  const reach = (BLOB_SIZE + hazard.size) / 2
  return Math.abs(player.x - hazard.x) <= reach && Math.abs(player.y - hazard.y) <= reach
}
