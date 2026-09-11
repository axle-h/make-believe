import type { Recipient, ServerToHostMessage } from '@make-believe/shared'
import type { Carryable } from '../carryables.js'
import type { Hazard } from '../hazards.js'
import type { Obstacle } from '../obstacles.js'
import type { Rng } from '../rng.js'
import type { GameState, Player, World } from '../state.js'
import type { Zone } from '../zones.js'
import type { DrawItObjective } from './drawIt.js'
import type { FetchObjective } from './fetch.js'
import type { FindYourColourObjective } from './findYourColour.js'
import type { FollowTheChainObjective } from './followTheChain.js'
import type { DodgeObjective } from './dodge.js'
import type { HotPotatoObjective } from './hotPotato.js'
import type { MovingPadObjective } from './movingPad.js'
import type { InOrderObjective } from './inOrder.js'
import type { KeepTheCrownObjective } from './keepTheCrown.js'
import type { OnTheSpotObjective } from './onTheSpot.js'
import type { RaceObjective } from './race.js'
import type { PairsObjective } from './pairs.js'
import type { SortingObjective } from './sorting.js'
import type { SumoObjective } from './sumo.js'
import type { TooHeavyObjective } from './tooHeavyForOne.js'

export type Outcome = 'running' | 'done' | 'expired'

export interface Brief {
  to: Recipient
  /** `''` takes the strip down. */
  headline: string
  detail?: string
  colour?: string
  /** A word of the headline to paint in `colour`; the schema refuses one that is not in it. */
  emphasis?: string
  tone: 'task' | 'win' | 'miss' | 'level'
}

/** Drawn beside the blob's name, never over its middle, which is the child's own drawing. */
export interface Mark {
  playerId: string
  badge: string
}

export interface ObjectiveBase {
  id: string
  headline: string
  remainingMs: number
  totalMs: number
  /** `held` stops the clock and takes the timer bar off the TV; absent means running. */
  clock?: 'running' | 'held'
  zones: Zone[]
  obstacles: Obstacle[]
  marks: Mark[]
  carryables: Carryable[]
  hazards?: Hazard[]
  /** Still driving but not hittable, and no longer fuzzy the instant the task ends. */
  fuzzy?: string[]
  /** Ringed on the TV from behind, never over the child's drawing. */
  danger?: string[]
  outcome: Outcome
  /** Cheerful either way; `null` while it is still running. */
  note: string | null
}

export type Objective =
  | OnTheSpotObjective
  | RaceObjective
  | MovingPadObjective
  | HotPotatoObjective
  | PairsObjective
  | FollowTheChainObjective
  | FindYourColourObjective
  | DrawItObjective
  | FetchObjective
  | SortingObjective
  | InOrderObjective
  | DodgeObjective
  | TooHeavyObjective
  | SumoObjective
  | KeepTheCrownObjective

export interface GenerateContext {
  id: string
  world: World
  rng: Rng
  level: number
  players: Player[]
  /** The standing crown outlives the task that gave it, so keep the crown starts from whoever has it. */
  crown: string | null
}

// Every task obeys five rules; registry.test.ts asserts what must hold of every task.
// 1. A task changes only what the world asks for, never what a phone offers: a wall, never ignored input.
// 2. A task is judged against whoever is present right now.
// 3. Nobody is eliminated: out means fuzzy, and nothing may leave a blob where it cannot drive out.
// 4. Failure barely exists: the score only goes up and the level never comes down.
// 5. The TV is the primary signal; a brief to one phone alone is spent sparingly.
// The methods are shorthand so their parameters are bivariant, which lets the registry mix kinds without casts.
export interface ObjectiveTemplate<T extends Objective = Objective> {
  kind: T['kind']
  /** For the grown-ups' menus; never shown to a child. */
  title: string
  minPlayers: number
  minLevel: number
  /** Checked on choosing and while running; a task that stops suiting the room is dropped. */
  suits?(present: number): boolean
  generate(context: GenerateContext): T
  step(objective: T, state: GameState, dtMs: number): void
  /** The director sends only what has changed. */
  briefs(objective: T, state: GameState): Brief[]
  observe?(objective: T, state: GameState, message: ServerToHostMessage): void
}

/** 0 at level 1 to 1 at the top of the ladder; every generator scales through it. */
export function difficulty(level: number, maxLevel: number): number {
  if (maxLevel <= 1) return 0
  const clamped = Math.min(Math.max(level, 1), maxLevel)
  return (clamped - 1) / (maxLevel - 1)
}

export function scale(easy: number, hard: number, hardness: number): number {
  return easy + (hard - easy) * hardness
}
