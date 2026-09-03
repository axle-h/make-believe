import { BLOB_SIZE } from './constants.js'
import { players } from './selectors.js'
import { clampToWorld, type GameState, type Player } from './state.js'

/**
 * Blobs are solid: they shove each other about rather than sliding through.
 *
 * This is positional, not a physics engine — overlapping blobs are pushed
 * apart along whichever axis they overlap least, half the distance each, and
 * that is the whole of it. Driving into somebody therefore pushes them, which
 * is the point of it in a game for children.
 *
 * A blob whose phone has gone is a ghost and collides with nothing: it is
 * drawn faded because it is not really there, and a child who puts a phone
 * down should not leave a wall in the middle of the floor.
 */

/**
 * How many times to go round separating everybody. A pair is sorted out in one
 * pass, wall or no wall; the passes are for chains, where pushing A out of B
 * puts A into C.
 */
export const COLLISION_PASSES = 4

export function resolveCollisions(state: GameState): void {
  const solid = players(state).filter((player) => !player.away)
  if (solid.length < 2) return

  for (let pass = 0; pass < COLLISION_PASSES; pass++) {
    let anyMoved = false
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]
        const b = solid[j]
        if (!a || !b) continue
        if (separate(state, a, b)) anyMoved = true
      }
    }
    if (!anyMoved) return
  }
}

/** Push one overlapping pair apart. Returns true if they were overlapping. */
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

/**
 * Move the two of them `overlap` apart, half each. Whatever a wall refuses to
 * let one of them give is handed to the other, so a blob pinned against the
 * edge still ends up with its neighbour outside it rather than slowly
 * converging on it over many frames.
 */
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

/**
 * Which way `b` is from `a` along an axis. Two blobs sitting exactly on top of
 * one another have no direction to give, so slot order decides — arbitrary,
 * but the same every frame, which is what stops them shimmering.
 */
function direction(gap: number, a: Player, b: Player): number {
  if (gap > 0) return 1
  if (gap < 0) return -1
  return a.slot < b.slot ? 1 : -1
}

/** Move a blob along one axis, and say how far it actually managed to go. */
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

/**
 * How close two blobs have to be to count as touching. The separation pass
 * leaves a pair sitting exactly edge to edge, so a test for real overlap would
 * only ever catch them on the one frame they collided; a few pixels of slack
 * makes a brush past enough.
 */
export const TOUCH_REACH = BLOB_SIZE + 4

/** Whether these two are close enough to be leaning on one another. */
export function touching(a: Player, b: Player): boolean {
  return Math.abs(a.x - b.x) <= TOUCH_REACH && Math.abs(a.y - b.y) <= TOUCH_REACH
}

/**
 * Who this blob is touching, if anybody: the nearest of them, so driving into
 * a huddle finds the blob actually run into rather than whichever happens to
 * come first in the list.
 */
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
 * A proper shove. Driving into a blob already moves it, but only by however
 * much it was in the way, which is a nudge; a task that is *about* shoving
 * wants more than that. This gives whoever is driving into somebody a push of
 * their own, on top of the separation that has already happened.
 *
 * Two blobs leaning into each other equally cancel out and neither moves,
 * which is the same bargain the crate strikes and reads the same way from the
 * sofa: shoving somebody who is shoving back gets you nowhere.
 *
 * Nothing in `tick` calls it. It is opt-in, and it belongs to the one task
 * built out of it — a world where every touch sends a three-year-old skidding
 * across the floor is a world where nobody can stand still on a pad.
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

/** One pair leaning on each other: whoever is driving harder moves the other. */
function lean(state: GameState, a: Player, b: Player, by: number): void {
  if (!touching(a, b)) return
  const gapX = b.x - a.x
  const gapY = b.y - a.y
  const distance = Math.hypot(gapX, gapY)
  // Dead on top of one another there is no direction to shove in; the
  // separation pass is already dealing with them and will have them apart.
  if (distance === 0) return

  const towardsB = { x: gapX / distance, y: gapY / distance }
  // How much each of them is actually driving at the other, and who wins.
  const push = driving(a, towardsB.x, towardsB.y) - driving(b, -towardsB.x, -towardsB.y)
  if (push === 0) return

  // A positive push sends `b` away from `a`; a negative one does the reverse,
  // which the sign of the vector takes care of on its own.
  const shoved = push > 0 ? b : a
  const step = push * by
  const moved = clampToWorld(state, shoved.x + towardsB.x * step, shoved.y + towardsB.y * step)
  shoved.x = moved.x
  shoved.y = moved.y
}

/** How hard a blob is driving in a given direction, from 0 to 1. */
function driving(player: Player, x: number, y: number): number {
  return Math.max(0, player.dx * x + player.dy * y)
}
