import { MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { blobsIn, placeZone, radiusFor, type CircleZone } from '../zones.js'
import { hold, secondsLeft } from './hold.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/** Everybody on the spot: every present blob stands in one circle at once, for a moment. */

export interface OnTheSpotObjective extends ObjectiveBase {
  kind: 'onTheSpot'
  holdMs: number
  /** Banked hold; it drains when somebody steps off rather than resetting. */
  heldMs: number
}

/** Comfortable at first, a squash later. */
const ROOMINESS = { easy: 1.5, hard: 0.85 }
const HOLD = { easy: 1_500, hard: 3_500 }
const TIME_LIMIT = { easy: 45_000, hard: 25_000 }

export const onTheSpot: ObjectiveTemplate<OnTheSpotObjective> = {
  kind: 'onTheSpot',
  title: 'Stand on the spot',
  minPlayers: 2,
  minLevel: 1,

  generate(context: GenerateContext): OnTheSpotObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const roominess = scale(ROOMINESS.easy, ROOMINESS.hard, hard) * range(rng, 0.94, 1.06)
    const radius = radiusFor(context.players.length, roominess)
    const at = placeZone(rng, context.world, radius, [])
    const zone: CircleZone = {
      id: `${context.id}-spot`,
      shape: 'circle',
      x: at.x,
      y: at.y,
      radius,
      colour: pick(rng, ZONE_COLOURS).hex
    }
    return {
      kind: 'onTheSpot',
      id: context.id,
      headline: 'Everybody on the spot!',
      remainingMs: Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard)),
      totalMs: Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard)),
      zones: [zone],
      obstacles: [],
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      holdMs: Math.round(scale(HOLD.easy, HOLD.hard, hard)),
      heldMs: 0,
    }
  },

  /** Judged against whoever is present, so an away blob never stops the rest finishing. */
  step(objective, state, dtMs) {
    const present = activePlayers(state)
    const zone = objective.zones[0]
    if (!zone || present.length === 0) return

    const everybody = blobsIn(zone, present).length === present.length
    if (hold(objective, everybody, dtMs)) objective.outcome = 'done'
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const zone = objective.zones[0]
    const onIt = zone ? blobsIn(zone, present).length : 0
    const holding = present.length > 0 && onIt === present.length
    // Whole seconds, so the brief changes at most once a second.
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: holding
        ? `Hold it… ${secondsLeft(objective)}`
        : `${onIt} of ${present.length} on the spot`,
      tone: 'task',
    }
    if (zone) brief.colour = zone.colour
    return [brief]
  },
}
