import type { Recipient, ServerToHostMessage } from '@make-believe/shared'
import type { Rng } from '../rng.js'
import type { GameState, Player, World } from '../state.js'
import type { Zone } from '../zones.js'
import type { OnTheSpotObjective } from './onTheSpot.js'

/**
 * What the world is asking for. There is always exactly one of these running,
 * it is always for everybody, and finishing it makes the next one immediately:
 * an objective is a thing the *world* wants, never a mode a phone is put into.
 *
 * Nothing here can change what a phone offers. Drive, say something, redraw,
 * rename — all four are live in every task, for every player, the whole time.
 */

/** How an objective ended, or that it has not. */
export type Outcome = 'running' | 'done' | 'expired'

/** What one phone is told. `'*'` is everybody, which is most of them. */
export interface Brief {
  to: Recipient
  /** One short line. `''` takes the strip down. */
  headline: string
  /** The quieter second line: a count, a hint, or the half only you are told. */
  detail?: string
  colour?: string
  tone: 'task' | 'win' | 'miss'
}

export interface ObjectiveBase {
  /** Stable across the objective's life; the renderer keeps its views by it. */
  id: string
  /** The one line across the top of the TV. */
  headline: string
  remainingMs: number
  totalMs: number
  zones: Zone[]
  outcome: Outcome
  /**
   * What the TV says once it is over — cheerful either way, because running
   * out of time is not losing. `null` while it is still running.
   */
  note: string | null
}

/** Every kind of objective there is. One file each, listed in the registry. */
export type Objective = OnTheSpotObjective

export interface GenerateContext {
  /** Minted by the director, so ids are stable and predictable in a test. */
  id: string
  world: World
  rng: Rng
  level: number
  /** The blobs present when it was made. It is judged against whoever is present later. */
  players: Player[]
}

/**
 * One kind of task. Small on purpose: adding the tenth one should cost a file
 * and a line in the registry, and nothing else.
 *
 * The methods are written in shorthand deliberately. TypeScript makes method
 * parameters bivariant, which is what lets the registry hold templates for
 * different objectives side by side without a cast at every call.
 */
export interface ObjectiveTemplate<T extends Objective = Objective> {
  kind: T['kind']
  /** Fewest present blobs for it to mean anything. */
  minPlayers: number
  /** The level at which it starts appearing. */
  minLevel: number
  generate(context: GenerateContext): T
  /** One step of this task. Sets `outcome` when it is finished. */
  step(objective: T, state: GameState, dtMs: number): void
  /** What each phone should be told. The director only sends what has changed. */
  briefs(objective: T, state: GameState): Brief[]
  /** For the tasks that are about talking or drawing. */
  observe?(objective: T, state: GameState, message: ServerToHostMessage): void
}

/**
 * How hard the world is being, from 0 at level 1 to 1 at the top of the ladder.
 * Every generator scales its own parameters through this, so "harder" means
 * the same thing everywhere.
 */
export function difficulty(level: number, maxLevel: number): number {
  if (maxLevel <= 1) return 0
  const clamped = Math.min(Math.max(level, 1), maxLevel)
  return (clamped - 1) / (maxLevel - 1)
}

/** Interpolate between two ends of a parameter by `difficulty`. */
export function scale(easy: number, hard: number, hardness: number): number {
  return easy + (hard - easy) * hardness
}
