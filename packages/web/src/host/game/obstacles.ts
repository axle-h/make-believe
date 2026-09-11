import { BLOB_SIZE } from './constants.js'
import { players } from './selectors.js'
import { clampToWorld, type GameState, type Player } from './state.js'

/**
 * Walls blobs cannot drive through. A blob standing where one appears is slid out over a few frames rather
 * than teleported, and a blob caught inside a moving wall is carried along with it.
 */

/** A crate is a box too, which is why separation works on `Box` rather than `Obstacle`. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
  /** Radians about its middle: a real oriented box, so the model and the TV agree on where a wall is. */
  angle?: number
}

/** Along its own line, eased by a sine so it hangs at each end. */
export interface Bob {
  kind: 'bob'
  homeX: number
  homeY: number
  reachX: number
  reachY: number
  periodMs: number
  atMs: number
}

export interface Spin {
  kind: 'spin'
  radiansPerSecond: number
}

export type Motion = Bob | Spin

export interface Obstacle extends Box {
  id: string
  motion?: Motion
  /** Last step's movement, which a blob caught inside is carried by before it is separated. */
  drift?: { dx: number; dy: number; spin: number }
}

/** Well under sumo's shove, so nobody is ever helpless against a moving wall. */
export const CARRY_SPEED = 120

/** Walls move before blobs are pushed out of them, so a wall shoves a blob rather than swallowing one. */
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

/** Slow enough that a blob standing where a wall appears is slid out where it can see it, not teleported. */
export const PUSH_OUT_SPEED = 900

/** Turning a push out of a bar's frame and back lands a rounding error short, so it overshoots by this. */
const OUT_BY = 0.01

/** Returns whoever had to be pushed, which is what a bounce is worked out from; away blobs are ghosts. */
export function pushOutOfObstacles(
  state: GameState,
  obstacles: readonly Obstacle[],
  dtMs: number,
): Set<string> {
  const touched = new Set<string>()
  if (obstacles.length === 0) return touched
  const limit = PUSH_OUT_SPEED * (Math.max(0, dtMs) / 1000)
  for (const player of players(state)) {
    if (player.away) continue
    for (const obstacle of obstacles) {
      carryAlong(state, player, obstacle, dtMs)
      if (pushOutOfBox(state, player, obstacle, limit)) touched.add(player.playerId)
    }
  }
  return touched
}

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

export function insideObstacle(obstacle: Box, x: number, y: number): boolean {
  const local = intoFrame(obstacle, x, y)
  return (
    Math.abs(local.x) < (BLOB_SIZE + obstacle.width) / 2 &&
    Math.abs(local.y) < (BLOB_SIZE + obstacle.height) / 2
  )
}

/** Turned back by the box's angle, so the maths works square on and the answer is turned out again. */
function intoFrame(obstacle: Box, x: number, y: number): { x: number; y: number } {
  const gapX = x - obstacle.x
  const gapY = y - obstacle.y
  const angle = obstacle.angle ?? 0
  if (angle === 0) return { x: gapX, y: gapY }
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  return { x: cos * gapX - sin * gapY, y: sin * gapX + cos * gapY }
}

/** Out along the shortest way by at most `limit`; true if the blob was inside at all. */
export function pushOutOfBox(
  state: GameState,
  player: Player,
  obstacle: Box,
  limit: number,
): boolean {
  const local = intoFrame(obstacle, player.x, player.y)
  const overlapX = (BLOB_SIZE + obstacle.width) / 2 - Math.abs(local.x)
  const overlapY = (BLOB_SIZE + obstacle.height) / 2 - Math.abs(local.y)
  if (overlapX <= 0 || overlapY <= 0) return false

  const horizontal = overlapX <= overlapY
  const overlap = horizontal ? overlapX : overlapY
  // Dead in the middle it goes one way rather than shimmering between the two.
  const away = (horizontal ? local.x : local.y) >= 0 ? 1 : -1
  const step = Math.min(overlap + OUT_BY, limit) * away

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
  return true
}

/**
 * Touching walls on one line fold into one, so a run draws as one wall. Only motionless, unrotated walls
 * merge, since two walls in the same place now are not the same wall if one is about to move.
 * The merged wall keeps the first segment's id.
 */
export function mergeWalls(walls: readonly Obstacle[]): Obstacle[] {
  const still: Obstacle[] = []
  const moving: Obstacle[] = []
  for (const wall of walls) {
    if (wall.motion === undefined && wall.angle === undefined) still.push(wall)
    else moving.push(wall)
  }
  return [...alongX(alongY(still)), ...moving]
}

const TOUCHING = 0.001

function alongY(walls: readonly Obstacle[]): Obstacle[] {
  return fold(
    walls,
    (wall) => `${wall.x}:${wall.width}`,
    (wall) => wall.y,
    (wall) => wall.height,
    (first, middle, length) => ({ ...first, y: middle, height: length }),
  )
}

function alongX(walls: readonly Obstacle[]): Obstacle[] {
  return fold(
    walls,
    (wall) => `${wall.y}:${wall.height}`,
    (wall) => wall.x,
    (wall) => wall.width,
    (first, middle, length) => ({ ...first, x: middle, width: length }),
  )
}

/** Only ends that meet are joined: a gap between two walls on a line is a corridor. */
function fold(
  walls: readonly Obstacle[],
  line: (wall: Obstacle) => string,
  along: (wall: Obstacle) => number,
  span: (wall: Obstacle) => number,
  stretch: (first: Obstacle, middle: number, length: number) => Obstacle,
): Obstacle[] {
  const lines = new Map<string, Obstacle[]>()
  for (const wall of walls) {
    const key = line(wall)
    const found = lines.get(key)
    if (found) found.push(wall)
    else lines.set(key, [wall])
  }

  const merged: Obstacle[] = []
  for (const group of lines.values()) {
    // oxlint-disable-next-line unicorn/no-array-sort -- `group` is ours alone
    const sorted = [...group].sort((one, other) => along(one) - along(other))
    let run = sorted[0] as Obstacle
    let from = along(run) - span(run) / 2
    let to = along(run) + span(run) / 2
    for (const wall of sorted.slice(1)) {
      const start = along(wall) - span(wall) / 2
      const end = along(wall) + span(wall) / 2
      if (start <= to + TOUCHING) {
        to = Math.max(to, end)
        continue
      }
      merged.push(stretch(run, (from + to) / 2, to - from))
      run = wall
      from = start
      to = end
    }
    merged.push(stretch(run, (from + to) / 2, to - from))
  }
  return merged
}
