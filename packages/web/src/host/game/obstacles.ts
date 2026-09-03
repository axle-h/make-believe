import { BLOB_SIZE } from './constants.js'
import { players } from './selectors.js'
import { clampToWorld, type GameState, type Player } from './state.js'

/**
 * Walls. A task can put a few solid blocks on the floor — a bar across the
 * middle, a square to go round — and blobs cannot drive through them.
 *
 * They exist because a chase on an empty floor is two blobs in a straight
 * line, and a chase around a corner is a game. Nothing else uses them yet and
 * nothing has to: a task with no obstacles has an empty list and pays nothing.
 *
 * An obstacle is a rectangle and a blob is a square, so keeping one out of the
 * other is the same trick the blobs already use on each other: find the axis
 * they overlap least on and give way along it.
 */

export interface Obstacle {
  /** Stable for the life of the objective; the renderer keeps its views by it. */
  id: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * How fast a blob is moved out of a wall it is already inside, in pixels a
 * second.
 *
 * Driving into a wall only ever buries a blob by one frame's worth of travel,
 * which this covers many times over — so it is not really a speed limit at
 * all. It is for the other case: the obstacles appear when a task starts, and
 * whoever was standing where a wall now is gets slid out over a few frames
 * where they can see it happen, rather than being teleported somewhere new.
 */
export const PUSH_OUT_SPEED = 900

/** Everybody out of every wall. Called once a step, after they have all moved. */
export function pushOutOfObstacles(
  state: GameState,
  obstacles: readonly Obstacle[],
  dtMs: number,
): void {
  if (obstacles.length === 0) return
  const limit = PUSH_OUT_SPEED * (Math.max(0, dtMs) / 1000)
  // A blob whose phone has gone is a ghost and is not really there, exactly as
  // it is not really there for the other blobs.
  for (const player of players(state)) {
    if (player.away) continue
    for (const obstacle of obstacles) pushOut(state, player, obstacle, limit)
  }
}

/** Whether a blob is standing in this wall. */
export function insideObstacle(obstacle: Obstacle, x: number, y: number): boolean {
  return (
    Math.abs(x - obstacle.x) < (BLOB_SIZE + obstacle.width) / 2 &&
    Math.abs(y - obstacle.y) < (BLOB_SIZE + obstacle.height) / 2
  )
}

/** One blob, one wall: out along whichever way is shortest, but not instantly. */
function pushOut(state: GameState, player: Player, obstacle: Obstacle, limit: number): void {
  const gapX = player.x - obstacle.x
  const gapY = player.y - obstacle.y
  const overlapX = (BLOB_SIZE + obstacle.width) / 2 - Math.abs(gapX)
  const overlapY = (BLOB_SIZE + obstacle.height) / 2 - Math.abs(gapY)
  if (overlapX <= 0 || overlapY <= 0) return

  const horizontal = overlapX <= overlapY
  const overlap = horizontal ? overlapX : overlapY
  // Dead in the middle of a wall there is no near side, so it goes one way
  // rather than shimmering between the two.
  const away = (horizontal ? gapX : gapY) >= 0 ? 1 : -1
  const step = Math.min(overlap, limit) * away

  const moved = clampToWorld(
    state,
    horizontal ? player.x + step : player.x,
    horizontal ? player.y : player.y + step,
  )
  player.x = moved.x
  player.y = moved.y
}
