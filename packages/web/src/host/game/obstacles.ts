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

/**
 * A rectangle blobs are kept out of. Walls are the obvious ones; a crate is
 * the other, which is why the separation below works on a plain box rather
 * than on an `Obstacle` — "push it together" is the one task built on a thing
 * being in the way, and the thing has to actually be in the way.
 */
export interface Box {
  x: number
  y: number
  width: number
  height: number
  /**
   * Turned about its own middle, in radians. Absent is square on, which is
   * every wall in the game bar one: the race's turning bar is the only thing
   * that needs an angle, and it is worth about thirty lines to have it be a
   * real oriented box rather than a row of little squares pretending to be a
   * bar. The model is what the e2e reads and what the TV draws, and the two
   * must not disagree about where a wall is.
   */
  angle?: number
}

/** Up and down its own line, eased so that it hangs at each end. */
export interface Bob {
  kind: 'bob'
  /** The middle of its travel. */
  homeX: number
  homeY: number
  /** How far each way, and which way. */
  reachX: number
  reachY: number
  periodMs: number
  /** How far through the period it is. */
  atMs: number
}

/** Turning slowly about its own centre. */
export interface Spin {
  kind: 'spin'
  radiansPerSecond: number
}

export type Motion = Bob | Spin

export interface Obstacle extends Box {
  /** Stable for the life of the objective; the renderer keeps its views by it. */
  id: string
  /** How it moves, if it moves at all. Most walls do not. */
  motion?: Motion
  /**
   * How far it moved on the last step. A blob caught inside a moving wall is
   * carried by this much before it is separated, which is being pushed aside
   * by a platform rather than being squeezed out of its near side.
   */
  drift?: { dx: number; dy: number; spin: number }
}

/**
 * How fast a wall may carry a blob along with it. Well under the shove in
 * sumo, so that being swept along by a turning bar is a joke rather than a
 * force nobody can drive against.
 */
export const CARRY_SPEED = 120

/**
 * Everything on the floor that moves, moved. Called once a step, before the
 * blobs are pushed out of any of it — the wall goes first and the blobs are
 * separated afterwards, which is a wall shoving a blob rather than swallowing
 * one, exactly as a crate does.
 */
export function stepObstacles(obstacles: readonly Obstacle[], dtMs: number): void {
  const seconds = Math.max(0, dtMs) / 1000
  for (const obstacle of obstacles) {
    const motion = obstacle.motion
    if (!motion) continue
    const wasX = obstacle.x
    const wasY = obstacle.y
    const wasAngle = obstacle.angle ?? 0

    if (motion.kind === 'bob') {
      motion.atMs = (motion.atMs + Math.max(0, dtMs)) % motion.periodMs
      // A sine is the whole of it, and it hangs at each end for free, which
      // reads as bouncy rather than mechanical.
      const along = Math.sin((motion.atMs / motion.periodMs) * Math.PI * 2)
      obstacle.x = motion.homeX + motion.reachX * along
      obstacle.y = motion.homeY + motion.reachY * along
    } else {
      obstacle.angle = wasAngle + motion.radiansPerSecond * seconds
    }

    obstacle.drift = {
      dx: obstacle.x - wasX,
      dy: obstacle.y - wasY,
      spin: (obstacle.angle ?? 0) - wasAngle,
    }
  }
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

/** How far past the edge a push-out lands, to keep it clear of rounding. */
const OUT_BY = 0.01

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
    for (const obstacle of obstacles) {
      carryAlong(state, player, obstacle, dtMs)
      pushOutOfBox(state, player, obstacle, limit)
    }
  }
}

/**
 * A blob caught inside something that has just moved goes with it — carried
 * aside by a platform rather than squeezed out of its near side. A turning bar
 * sweeps whoever is on it along its length, which is the joke, and both are
 * capped well below the shove in sumo so that nobody is ever helpless.
 */
function carryAlong(state: GameState, player: Player, obstacle: Obstacle, dtMs: number): void {
  const drift = obstacle.drift
  if (!drift || !insideObstacle(obstacle, player.x, player.y)) return

  // Where the spin would take it: the blob's offset from the centre, turned.
  const gapX = player.x - obstacle.x
  const gapY = player.y - obstacle.y
  const swept = Math.cos(drift.spin) * gapX - Math.sin(drift.spin) * gapY - gapX
  const sweptY = Math.sin(drift.spin) * gapX + Math.cos(drift.spin) * gapY - gapY

  const limit = CARRY_SPEED * (Math.max(0, dtMs) / 1000)
  const wantX = drift.dx + swept
  const wantY = drift.dy + sweptY
  const distance = Math.hypot(wantX, wantY)
  const scale = distance > limit && distance > 0 ? limit / distance : 1

  const moved = clampToWorld(state, player.x + wantX * scale, player.y + wantY * scale)
  player.x = moved.x
  player.y = moved.y
}

/** Whether a blob is standing in this wall — or in anything else solid. */
export function insideObstacle(obstacle: Box, x: number, y: number): boolean {
  const local = intoFrame(obstacle, x, y)
  return (
    Math.abs(local.x) < (BLOB_SIZE + obstacle.width) / 2 &&
    Math.abs(local.y) < (BLOB_SIZE + obstacle.height) / 2
  )
}

/**
 * A point in the box's own frame: the gap from its middle, turned back by
 * whatever the box is turned by. Everything below then works on a box that is
 * square on, and the answer is turned out again at the end.
 */
function intoFrame(obstacle: Box, x: number, y: number): { x: number; y: number } {
  const gapX = x - obstacle.x
  const gapY = y - obstacle.y
  const angle = obstacle.angle ?? 0
  if (angle === 0) return { x: gapX, y: gapY }
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  return { x: cos * gapX - sin * gapY, y: sin * gapX + cos * gapY }
}

/**
 * One blob, one rectangle: out along whichever way is shortest, but not
 * instantly. `limit` is how far it may be moved this step — see
 * `PUSH_OUT_SPEED` for why it is a few frames rather than one.
 */
export function pushOutOfBox(state: GameState, player: Player, obstacle: Box, limit: number): void {
  // In the box's own frame the blob is a circle rather than a square, which
  // is forgiving by construction — and forgiving is the right way to be wrong
  // for a four-year-old.
  const local = intoFrame(obstacle, player.x, player.y)
  const overlapX = (BLOB_SIZE + obstacle.width) / 2 - Math.abs(local.x)
  const overlapY = (BLOB_SIZE + obstacle.height) / 2 - Math.abs(local.y)
  if (overlapX <= 0 || overlapY <= 0) return

  const horizontal = overlapX <= overlapY
  const overlap = horizontal ? overlapX : overlapY
  // Dead in the middle of a wall there is no near side, so it goes one way
  // rather than shimmering between the two.
  const away = (horizontal ? local.x : local.y) >= 0 ? 1 : -1
  // A hair past the edge rather than exactly onto it: turning a push out of a
  // bar's own frame and back lands a rounding error short of the boundary, and
  // a blob a millionth of a pixel inside a wall is a blob inside a wall.
  const step = Math.min(overlap + OUT_BY, limit) * away

  // ...and the push is turned back out of the frame it was worked out in.
  const angle = obstacle.angle ?? 0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const outX = horizontal ? step : 0
  const outY = horizontal ? 0 : step

  const moved = clampToWorld(
    state,
    player.x + cos * outX - sin * outY,
    player.y + sin * outX + cos * outY,
  )
  player.x = moved.x
  player.y = moved.y
}
