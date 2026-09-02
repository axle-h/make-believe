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

/**
 * Everybody on the spot. One circle appears and every blob in the room has to
 * be standing in it at the same time, and stay there for a moment.
 *
 * It is the simplest thing that works: it needs no verb a phone does not
 * already have, a three-year-old understands it from the picture alone, and as
 * the circle shrinks they cannot all fit without shoving each other — which
 * the collision code already makes the funniest part of the game.
 */

export interface OnTheSpotObjective extends ObjectiveBase {
  kind: 'onTheSpot'
  /** How long everybody has to stay on it, all together. */
  holdMs: number
  /** How much of that they have banked. It drains when somebody steps off. */
  heldMs: number
}

/** How much elbow room the circle gives: comfortable at first, a squash later. */
const ROOMINESS = { easy: 1.5, hard: 0.85 }
/** How long they must all stand there. */
const HOLD = { easy: 1_500, hard: 3_500 }
/** How long they have to manage it before it gives up and makes another. */
const TIME_LIMIT = { easy: 45_000, hard: 25_000 }

export const onTheSpot: ObjectiveTemplate<OnTheSpotObjective> = {
  kind: 'onTheSpot',
  /** One blob standing on a spot is not a thing anybody has to solve together. */
  minPlayers: 2,
  minLevel: 1,

  generate(context: GenerateContext): OnTheSpotObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    // A little jiggle either way, so two spots at the same level are not twins.
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
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      holdMs: Math.round(scale(HOLD.easy, HOLD.hard, hard)),
      heldMs: 0,
    }
  },

  /**
   * Judged against whoever is present *now*: a phone that has wandered off is
   * not counted, so a child putting their phone down never leaves the rest
   * with a task they cannot finish.
   */
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
    // Counting down in whole seconds: it changes once a second at most, so the
    // phones hear about it rarely, and a child can count along with it.
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: holding
        ? `Hold it… ${secondsLeft(objective)}`
        : `${onIt} of ${present.length} on the spot`,
      tone: 'task',
    }
    // The strip is tinted the colour of the spot they are looking for.
    if (zone) brief.colour = zone.colour
    return [brief]
  },
}
