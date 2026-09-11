import { BLOB_SIZE } from './constants.js'
import type { Player, World } from './state.js'

/** Things crossing the floor that cost a life when they catch a blob; unlike walls, they push nothing. */

export interface Hazard {
  /** The renderer keeps its views by it. */
  id: string
  x: number
  y: number
  /** World units a second. */
  vx: number
  vy: number
  size: number
  glyph: string
}

const GONE_BY = 80

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

/** Square overlap, not round. */
export function catches(hazard: Hazard, player: Player): boolean {
  const reach = (BLOB_SIZE + hazard.size) / 2
  return Math.abs(player.x - hazard.x) <= reach && Math.abs(player.y - hazard.y) <= reach
}
