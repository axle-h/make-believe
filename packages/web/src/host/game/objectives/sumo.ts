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
 * Sumo: stay on a shrinking island while `barge` makes shoves land hard.
 * Nobody is eliminated: a blob shoved off is on the floor beside the island and drives back on.
 */

export interface SumoObjective extends ObjectiveBase {
  kind: 'sumo'
  startRadius: number
  endRadius: number
  /** Shove strength, in pixels a second. */
  shove: number
}

/** Starting fraction of the biggest island that fits the floor. */
const ISLAND = { easy: 0.95, hard: 0.8 }
/** How many blobs still fit on it once it stops shrinking. */
const SURVIVORS = { easy: 3, hard: 1 }
const ROOMINESS = 1.2
const SHOVE = { easy: 130, hard: 260 }
const TIME_LIMIT = { easy: 30_000, hard: 22_000 }

export const sumo: ObjectiveTemplate<SumoObjective> = {
  kind: 'sumo',
  title: 'Sumo',
  minPlayers: 2,
  minLevel: 5,

  generate(context: GenerateContext): SumoObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context

    // Dead centre: against a wall, a shoved blob would be held on by the wall.
    const biggest = Math.min(context.world.width, context.world.height) / 2 - BLOB_SIZE / 2
    // Jiggled downwards only, so the island never grows off the floor.
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

  /** Judged against whoever is present: an away blob on the island does not count. */
  step(objective, state, dtMs) {
    const island = objective.zones[0]
    if (!island || island.shape !== 'circle') return

    // The radius is derived from the clock, so it cannot drift out of step with the timer bar.
    island.radius = islandRadius(objective)
    barge(state, objective.shove, dtMs)

    if (objective.remainingMs > 0) return
    // The buzzer ends it as done, before the director can call it a miss.
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
    if (island) brief.colour = island.colour
    return [brief]
  },
}

function islandRadius(objective: SumoObjective): number {
  if (objective.totalMs <= 0) return objective.endRadius
  const gone = 1 - objective.remainingMs / objective.totalMs
  return scale(objective.startRadius, objective.endRadius, Math.min(1, Math.max(0, gone)))
}

/** The buzzer line, cheerful whoever is left, including nobody. */
function whoHeldOn(standing: readonly Player[]): string {
  const last = standing[0]
  if (!last) return 'Everybody in the water! Have another go.'
  if (standing.length === 1) return `${last.name} is the last one standing!`
  return `${standing.length} of you held on!`
}
