import { resolveCollisions } from './collisions.js'
import { AWAY_TIMEOUT_MS, SPEED } from './constants.js'
import { forgetPlayer, stepObjectives } from './objectives/director.js'
import type { Sound } from './objectives/cues.js'
import type { Brief } from './objectives/types.js'
import { pushOutOfObstacles, stepObstacles } from './obstacles.js'
import { clampToWorld, type GameState } from './state.js'

/** Arcade physics is deliberately off: only the model moves a blob and the renderer copies positions from here. */

/** `tick` takes any step so tests can jump the clock; the renderer caps real frames at this. */
export const MAX_STEP_MS = 50

export interface TickResult {
  removed: string[]
  /** Only what has changed since the last step, for briefs and sounds alike. */
  briefs: Brief[]
  sounds: Sound[]
}

export function tick(state: GameState, dtMs: number): TickResult {
  const step = Math.max(0, dtMs)
  const seconds = step / 1000
  const removed: string[] = []
  const leaning = new Set<string>()

  for (const player of state.players.values()) {
    if (player.bubble) {
      player.bubble.remainingMs -= step
      if (player.bubble.remainingMs <= 0) player.bubble = null
    }
    if (player.away) {
      player.awayForMs += step
      if (player.awayForMs >= AWAY_TIMEOUT_MS) {
        state.players.delete(player.playerId)
        forgetPlayer(state, player.playerId)
        removed.push(player.playerId)
      }
      continue
    }
    const wantX = player.x + player.dx * SPEED * seconds
    const wantY = player.y + player.dy * SPEED * seconds
    const moved = clampToWorld(state, wantX, wantY)
    // Cut short by the edge of the floor counts as leaning, as a wall does.
    if (Math.abs(moved.x - wantX) > EDGE_SLACK || Math.abs(moved.y - wantY) > EDGE_SLACK) {
      leaning.add(player.playerId)
    }
    player.x = moved.x
    player.y = moved.y
  }

  // Walls before blobs, so a blob squeezed out of a wall ends beside its neighbours rather than inside them.
  const walls = state.objectives.current?.obstacles ?? []
  stepObstacles(walls, step)
  for (const id of pushOutOfObstacles(state, walls, step)) leaning.add(id)
  for (const id of resolveCollisions(state)) leaning.add(id)

  // Through the director so bounces share the rate limiter every cue goes through.
  state.objectives.sounds.push(...bounces(state, leaning))

  const { briefs, sounds } = stepObjectives(state, step)

  return { removed, briefs, sounds }
}

const EDGE_SLACK = 0.001

/** An edge, not a state: a blob held against a wall bounces once and must let go to bounce again. */
function bounces(state: GameState, leaning: Set<string>): Sound[] {
  const sounds: Sound[] = []
  for (const playerId of leaning) {
    if (!state.bumping.has(playerId)) sounds.push({ to: playerId, cue: 'bounce' })
  }
  state.bumping = leaning
  return sounds
}
