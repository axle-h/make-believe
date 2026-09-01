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
