import { barge } from '../collisions.js'
import { BLOB_SIZE, MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { Player } from '../state.js'
import { blobsIn, radiusFor, type CircleZone } from '../zones.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Sumo. One island in the middle of the floor, shrinking the whole time, and
 * the point is to still be standing on it when it stops.
 *
 * Blobs are already solid and already shove each other; this is the one task
 * that turns that up, so driving into somebody sends them properly skidding
 * rather than merely getting them out of your way. Two blobs leaning into each
 * other equally cancel out and neither moves, which is exactly as funny as it
 * sounds from the sofa.
 *
 * Nobody is eliminated and nobody sits out: a blob shoved off the island is
 * standing on the floor next to it and can drive straight back on, which is
 * most of the game. Being in the water is not a state a child has to be let
 * out of — it is a state they drive out of.
 */

export interface SumoObjective extends ObjectiveBase {
  kind: 'sumo'
  /** How big the island is at the start, and how small it ends up. */
  startRadius: number
  endRadius: number
  /** How hard a blob can shove another, in pixels a second. */
  shove: number
}

/** How much of the biggest island that would fit this one starts as. */
const ISLAND = { easy: 0.95, hard: 0.8 }
/** How many blobs still fit on it by the time it stops shrinking. */
const SURVIVORS = { easy: 3, hard: 1 }
/** How much elbow room those last few get. Under 1 they have to shove. */
const ROOMINESS = 1.2
/** How hard a shove lands, against a blob's own top speed. */
const SHOVE = { easy: 130, hard: 260 }
/** How long the island takes to shrink all the way. */
const TIME_LIMIT = { easy: 30_000, hard: 22_000 }

export const sumo: ObjectiveTemplate<SumoObjective> = {
  kind: 'sumo',
  title: 'Sumo',
  /** One blob alone on an island has nobody to shove and nobody to shove them. */
  minPlayers: 2,
  /**
   * Well up the ladder. It is trivial to understand — the island is right
   * there and it is plainly getting smaller — but it wants a room that can
   * already drive, because being shoved off and driving back on is the whole
   * of it and that is no fun at all if the joystick is still the hard part.
   */
  minLevel: 5,

  generate(context: GenerateContext): SumoObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context

    // The island sits dead in the middle rather than anywhere the generator
    // fancies: against a wall, a blob shoved off has nowhere to go and the
    // wall holds it on, which quietly undoes the one rule of the task.
    const biggest = Math.min(context.world.width, context.world.height) / 2 - BLOB_SIZE / 2
    // A little jiggle, never upwards, so two islands at the same level are not
    // twins and neither of them can grow off the edge of the floor.
    const startRadius = biggest * scale(ISLAND.easy, ISLAND.hard, hard) * range(rng, 0.94, 1)
    const survivors = Math.max(1, Math.round(scale(SURVIVORS.easy, SURVIVORS.hard, hard)))
    const endRadius = Math.min(startRadius, radiusFor(survivors, ROOMINESS))

    const island: CircleZone = {
      id: `${context.id}-island`,
      shape: 'circle',
      x: context.world.width / 2,
      y: context.world.height / 2,
      radius: startRadius,
      colour: pick(rng, ZONE_COLOURS).hex,
    }
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'sumo',
      id: context.id,
      headline: 'Stay on the island!',
      remainingMs: totalMs,
      totalMs,
      zones: [island],
      obstacles: [],
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      startRadius,
      endRadius,
      shove: Math.round(scale(SHOVE.easy, SHOVE.hard, hard)),
    }
  },

  /**
   * Judged against whoever is present *now*: a phone put down halfway through
   * takes its blob out of the reckoning rather than winning by standing still
   * in the middle, and it never stops the rest from being shoved about.
   */
  step(objective, state, dtMs) {
    const island = objective.zones[0]
    if (!island || island.shape !== 'circle') return

    // The island's size *is* the clock, rather than a second thing counting
    // down beside it. Nothing can drift out of step with the timer bar, and
    // the shrinking is what a child watches instead of reading it.
    island.radius = islandRadius(objective)
    barge(state, objective.shove, dtMs)

    if (objective.remainingMs > 0) return
    // The buzzer is the end of it rather than a failure to finish in time, so
    // this says so itself before the director can call it a miss.
    objective.outcome = 'done'
    objective.note = whoHeldOn(blobsIn(island, activePlayers(state)))
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const island = objective.zones[0]
    const on = island ? blobsIn(island, present).length : 0
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: `${on} of ${present.length} still on. Shove them off!`,
      tone: 'task',
    }
    // The strip is the colour of the island, which is the thing to look at.
    if (island) brief.colour = island.colour
    return [brief]
  },
}

/** How big the island is right now: all the way down as the clock runs out. */
function islandRadius(objective: SumoObjective): number {
  if (objective.totalMs <= 0) return objective.endRadius
  const gone = 1 - objective.remainingMs / objective.totalMs
  return scale(objective.startRadius, objective.endRadius, Math.min(1, Math.max(0, gone)))
}

/**
 * What the TV says at the buzzer. Cheerful whoever is left, including nobody:
 * an island small enough for one is an island everybody can slide off, and
 * that is the joke rather than a room that has failed at something.
 */
function whoHeldOn(standing: readonly Player[]): string {
  const last = standing[0]
  if (!last) return 'Everybody in the water! Have another go.'
  if (standing.length === 1) return `${last.name} is the last one standing!`
  return `${standing.length} of you held on!`
}
