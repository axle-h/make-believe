import {
  deliverInto,
  stepCarryables,
  stillOut,
  CRATE_PUSHERS,
  CRATE_SIZE,
  type Carryable,
  type Crate,
} from '../carryables.js'
import { MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import { pick, range } from '../rng.js'
import type { CircleZone } from '../zones.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Too heavy for one. A crate sits on the floor and will not move an inch for a
 * single blob, however hard it drives. Two of them leaning on it shift it by
 * the average of what the two of them are asking for — so it goes where the
 * two children agree it should go, and nowhere at all while they argue.
 *
 * It is the purest "this needs both of you" in the game: not two people doing
 * the same job in parallel, but one job that does not start until two of them
 * are on it. Of everything built out of carrying, this is the one worth having.
 */

export interface TooHeavyObjective extends ObjectiveBase {
  kind: 'tooHeavyForOne'
}

/** How far apart the crate and the spot start, as a share of the way out. */
const TRAVEL = { easy: 0.55, hard: 0.95 }
const TIME_LIMIT = { easy: 60_000, hard: 45_000 }

export const tooHeavyForOne: ObjectiveTemplate<TooHeavyObjective> = {
  kind: 'tooHeavyForOne',
  /** Two, and it means two: the crate is built not to move for one. */
  minPlayers: 2,
  minLevel: 7,

  generate(context: GenerateContext): TooHeavyObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context

    // The crate at one end of the floor and the spot at the other, rather than
    // both dropped at random and hoping: two children shoving a crate two feet
    // is not the game, and a generator that keeps rolling until it likes the
    // answer is one that can sit there rolling.
    const angle = range(rng, 0, Math.PI * 2)
    const share = scale(TRAVEL.easy, TRAVEL.hard, hard)
    const reach = {
      x: (context.world.width / 2 - CRATE_SIZE) * share,
      y: (context.world.height / 2 - CRATE_SIZE) * share,
    }
    const middle = { x: context.world.width / 2, y: context.world.height / 2 }
    const away = { x: Math.cos(angle) * reach.x, y: Math.sin(angle) * reach.y }

    const spot: CircleZone = {
      id: `${context.id}-spot`,
      shape: 'circle',
      x: middle.x + away.x,
      y: middle.y + away.y,
      radius: CRATE_SIZE * 0.9,
      colour: pick(rng, ZONE_COLOURS).hex,
    }
    const crate: Crate = {
      kind: 'crate',
      id: `${context.id}-crate`,
      x: middle.x - away.x,
      y: middle.y - away.y,
      colour: spot.colour,
      home: null,
      pushedBy: [],
    }

    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'tooHeavyForOne',
      id: context.id,
      headline: 'Push it together!',
      remainingMs: totalMs,
      totalMs,
      zones: [spot],
      marks: [],
      carryables: [crate as Carryable],
      outcome: 'running',
      note: null,
    }
  },

  step(objective, state, dtMs) {
    stepCarryables(state, objective.carryables, dtMs)
    deliverInto(objective.carryables, objective.zones, () => true)
    if (stillOut(objective.carryables).length === 0) {
      objective.outcome = 'done'
      objective.note = 'Heave! Well done, both of you.'
    }
  },

  briefs(objective) {
    const crate = objective.carryables[0]
    const pushing = crate?.kind === 'crate' ? crate.pushedBy.length : 0
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail:
        pushing >= CRATE_PUSHERS
          ? 'Heave! Same way, both of you…'
          : `${pushing} of ${CRATE_PUSHERS} leaning on it. It takes two`,
      tone: 'task',
    }
    const spot = objective.zones[0]
    if (spot) brief.colour = spot.colour
    return [brief]
  },
}
