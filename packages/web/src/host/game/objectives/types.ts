import type { Recipient, ServerToHostMessage } from '@make-believe/shared'
import type { Carryable } from '../carryables.js'
import type { Obstacle } from '../obstacles.js'
import type { Rng } from '../rng.js'
import type { GameState, Player, World } from '../state.js'
import type { Zone } from '../zones.js'
import type { ColourHuntObjective } from './colourHunt.js'
import type { DrawItObjective } from './drawIt.js'
import type { FetchObjective } from './fetch.js'
import type { FindYourColourObjective } from './findYourColour.js'
import type { FollowTheChainObjective } from './followTheChain.js'
import type { HotPotatoObjective } from './hotPotato.js'
import type { KeepTheCrownObjective } from './keepTheCrown.js'
import type { OnTheSpotObjective } from './onTheSpot.js'
import type { PairsObjective } from './pairs.js'
import type { SortingObjective } from './sorting.js'
import type { SumoObjective } from './sumo.js'
import type { TooHeavyObjective } from './tooHeavyForOne.js'

/**
 * What the world is asking for. There is always exactly one of these running,
 * it is always for everybody, and finishing it makes the next one immediately:
 * an objective is a thing the *world* wants, never a mode a phone is put into.
 *
 * Nothing here can change what a phone offers. Drive, say something, redraw —
 * all three are live in every task, for every player, the whole time, and so is
 * finishing and starting again.
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
  /**
   * How it should read. `task` is what the world wants, `win` and `miss` are
   * how the last one ended, and `level` is the room getting better — the one
   * line all evening that is about the children rather than the game, and the
   * only one either screen makes bigger than the rest.
   */
  tone: 'task' | 'win' | 'miss' | 'level'
}

/**
 * Something the world has pinned to one blob: the potato, the crown, whose
 * turn it is to draw. It is drawn *on* the blob rather than beside it, because
 * a child working out who has it should not have to read anything to find out,
 * and the names and bubbles are already stacked above their heads.
 */
export interface Mark {
  playerId: string
  /** A character or two. It has to carry across a room at a glance. */
  badge: string
}

export interface ObjectiveBase {
  /** Stable across the objective's life; the renderer keeps its views by it. */
  id: string
  /** The one line across the top of the TV. */
  headline: string
  remainingMs: number
  totalMs: number
  zones: Zone[]
  /**
   * The walls this task has put on the floor, if any. Blobs cannot drive
   * through them, and anybody standing where one appears is slid out of it.
   */
  obstacles: Obstacle[]
  /** Whatever the world has pinned to particular blobs, if anything. */
  marks: Mark[]
  /** The parcels and crates this task has put on the floor, if any. */
  carryables: Carryable[]
  outcome: Outcome
  /**
   * What the TV says once it is over — cheerful either way, because running
   * out of time is not losing. `null` while it is still running.
   */
  note: string | null
}

/** Every kind of objective there is. One file each, listed in the registry. */
export type Objective =
  | OnTheSpotObjective
  | HotPotatoObjective
  | PairsObjective
  | FollowTheChainObjective
  | FindYourColourObjective
  | ColourHuntObjective
  | DrawItObjective
  | FetchObjective
  | SortingObjective
  | TooHeavyObjective
  | SumoObjective
  | KeepTheCrownObjective

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
  /**
   * What to call it to a grown-up. It is never shown to a child — the banner
   * says what the world wants, not what the task is called — and exists so
   * that the TV's debug menu has something to list.
   */
  title: string
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
