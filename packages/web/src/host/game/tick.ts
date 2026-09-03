import { resolveCollisions } from './collisions.js'
import { AWAY_TIMEOUT_MS, SPEED } from './constants.js'
import { forgetPlayer, stepObjectives } from './objectives/director.js'
import type { Sound } from './objectives/cues.js'
import type { Brief } from './objectives/types.js'
import { pushOutOfObstacles } from './obstacles.js'
import { clampToWorld, type GameState } from './state.js'

/**
 * One step of the world. The model is the only thing that moves a blob: the
 * renderer reads positions from here rather than integrating its own.
 *
 * `tick` takes whatever step it is given, so a test can wind the clock forward
 * in one call. Capping a real frame is the renderer's job: see `MAX_STEP_MS`.
 */

/** Longest step a renderer should take, so a stalled tab cannot teleport anyone. */
export const MAX_STEP_MS = 50

export interface TickResult {
  /** Players forgotten this step because their phone never came back. */
  removed: string[]
  /**
   * What the phones need to hear about the objective, and only what has
   * changed — the wording, not every frame of it.
   */
  briefs: Brief[]
  /**
   * And what they should make a noise about: a parcel landing, a badge
   * arriving, a rung climbed. Also only what is new.
   */
  sounds: Sound[]
}

export function tick(state: GameState, dtMs: number): TickResult {
  const step = Math.max(0, dtMs)
  const seconds = step / 1000
  const removed: string[] = []

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
    const moved = clampToWorld(
      state,
      player.x + player.dx * SPEED * seconds,
      player.y + player.dy * SPEED * seconds,
    )
    player.x = moved.x
    player.y = moved.y
  }

  // Everybody has moved; now out of the walls, and then out of each other.
  // The walls come first because a blob squeezed out of one has to end up
  // beside its neighbours rather than inside them.
  pushOutOfObstacles(state, state.objectives.current?.obstacles ?? [], step)
  resolveCollisions(state)

  // And last, with everybody where they have ended up, ask whether the world
  // has got what it wanted.
  const { briefs, sounds } = stepObjectives(state, step)

  return { removed, briefs, sounds }
}
