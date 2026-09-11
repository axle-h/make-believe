import { BLOB_SIZE } from './constants.js'
import { players } from './selectors.js'
import { clampToWorld, type GameState, type Player } from './state.js'

/** Positional separation, not a physics engine; an away blob is a ghost and collides with nothing. */

/** Extra passes are for chains, where pushing A out of B puts A into C. */
export const COLLISION_PASSES = 4

/** Returns whoever had to be moved, which is what a bounce is worked out from. */
export function resolveCollisions(state: GameState): Set<string> {
  const touched = new Set<string>()
  const solid = players(state).filter((player) => !player.away)
  if (solid.length < 2) return touched

  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    let anyMoved = false
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]
        const b = solid[j]
        if (!a || !b) continue
        if (!separate(state, a, b)) continue
        anyMoved = true
        touched.add(a.playerId)
        touched.add(b.playerId)
      }
    }
    if (!anyMoved) return touched
  }
  return touched
}

function separate(state: GameState, a: Player, b: Player): boolean {
  const gapX = b.x - a.x
  const gapY = b.y - a.y
  const overlapX = BLOB_SIZE - Math.abs(gapX)
  const overlapY = BLOB_SIZE - Math.abs(gapY)
  if (overlapX <= 0 || overlapY <= 0) return false

  const horizontal = overlapX <= overlapY
  const overlap = horizontal ? overlapX : overlapY
  const away = direction(horizontal ? gapX : gapY, a, b)
  pushApart(state, a, b, horizontal, overlap, away)
  return true
}

/** Whatever the edge refuses one blob is handed to the other, so a pinned blob's neighbour still ends up outside it. */
function pushApart(
  state: GameState,
  a: Player,
  b: Player,
  horizontal: boolean,
  overlap: number,
  away: number,
): void {
  const half = overlap / 2
  const gaveB = shove(state, b, horizontal, half * away)
  const gaveA = shove(state, a, horizontal, -(overlap - gaveB) * away)
  const stillOverlapping = overlap - gaveB - gaveA
  if (stillOverlapping > 0) shove(state, b, horizontal, stillOverlapping * away)
}

/** Blobs exactly on top of one another are split by slot order, the same every frame so they do not shimmer. */
function direction(gap: number, a: Player, b: Player): number {
  if (gap > 0) return 1
  if (gap < 0) return -1
  return a.slot < b.slot ? 1 : -1
}

/** Returns how far it actually went. */
function shove(state: GameState, player: Player, horizontal: boolean, by: number): number {
  const before = horizontal ? player.x : player.y
  const moved = clampToWorld(
    state,
    horizontal ? player.x + by : player.x,
    horizontal ? player.y : player.y + by,
  )
  player.x = moved.x
  player.y = moved.y
  return Math.abs((horizontal ? player.x : player.y) - before)
}

/** Separation leaves a pair exactly edge to edge, so touching needs a little slack. */
export const TOUCH_REACH = BLOB_SIZE + 4

export function touching(a: Player, b: Player): boolean {
  return Math.abs(a.x - b.x) <= TOUCH_REACH && Math.abs(a.y - b.y) <= TOUCH_REACH
}

/** The nearest, so driving into a huddle finds the blob actually run into. */
export function nearestTouching(blob: Player, others: readonly Player[]): Player | null {
  let nearest: Player | null = null
  let shortest = Number.POSITIVE_INFINITY
  for (const other of others) {
    if (other.playerId === blob.playerId) continue
    if (!touching(blob, other)) continue
    const distance = Math.hypot(other.x - blob.x, other.y - blob.y)
    if (distance >= shortest) continue
    shortest = distance
    nearest = other
  }
  return nearest
}

/**
 * A push on top of separation for the one task about shoving; `tick` never calls it, or nobody could stand on a pad.
 * Two blobs leaning into each other equally cancel out.
 */
export function barge(state: GameState, speed: number, dtMs: number): void {
  const seconds = dtMs / 1000
  if (seconds <= 0) return
  const solid = players(state).filter((player) => !player.away)

  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]
      const b = solid[j]
      if (!a || !b) continue
      lean(state, a, b, speed * seconds)
    }
  }
}

function lean(state: GameState, a: Player, b: Player, by: number): void {
  if (!touching(a, b)) return
  const gapX = b.x - a.x
  const gapY = b.y - a.y
  const distance = Math.hypot(gapX, gapY)
  // No direction to shove in; the separation pass will have them apart.
  if (distance === 0) return

  const towardsB = { x: gapX / distance, y: gapY / distance }
  const push = driving(a, towardsB.x, towardsB.y) - driving(b, -towardsB.x, -towardsB.y)
  if (push === 0) return

  const shoved = push > 0 ? b : a
  const step = push * by
  const moved = clampToWorld(state, shoved.x + towardsB.x * step, shoved.y + towardsB.y * step)
  shoved.x = moved.x
  shoved.y = moved.y
}

function driving(player: Player, x: number, y: number): number {
  return Math.max(0, player.dx * x + player.dy * y)
}
