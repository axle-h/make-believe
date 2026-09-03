import {
  deliverInto,
  scatter,
  stepCarryables,
  stillOut,
  PARCEL_SIZE,
  type Carryable,
  type Parcel,
} from '../carryables.js'
import { MAX_LEVEL } from '../constants.js'
import { intRange } from '../rng.js'
import type { CircleZone } from '../zones.js'
import { makePads, MAX_NAMED_PADS, nameOfColour } from './pads.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Sorting. Fetch with one more rule: the parcels come in colours and each one
 * has to reach the depot of its own colour.
 *
 * That one rule is the whole difference, and it is the rule a four-year-old
 * gets first — the picture on the floor says it without a word, and a blob
 * carrying a yellow parcel past the yellow spot gets shouted at by the room,
 * which is the game working exactly as intended.
 */

export interface SortingObjective extends ObjectiveBase {
  kind: 'sorting'
  parcels: number
}

/** How many depots, and how many parcels between them. */
const DEPOTS = { easy: 2, hard: 3 }
const PARCELS = { easy: 4, hard: 6 }
const TIME_LIMIT = { easy: 70_000, hard: 55_000 }

export const sorting: ObjectiveTemplate<SortingObjective> = {
  kind: 'sorting',
  title: 'Sorting',
  minPlayers: 2,
  /** Everything about it is fetch, so a room meets it having already done that. */
  minLevel: 6,

  generate(context: GenerateContext): SortingObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const depots: CircleZone[] = makePads(
      context,
      Math.min(MAX_NAMED_PADS, Math.round(scale(DEPOTS.easy, DEPOTS.hard, hard))),
      Math.max(2, context.players.length),
      1.3,
    )
    // Named on the floor as well as coloured, for whoever is reading by then.
    for (const depot of depots) depot.label = nameOfColour(depot.colour).toUpperCase()

    const count = Math.round(scale(PARCELS.easy, PARCELS.hard, hard))
    const carryables: Carryable[] = scatter(rng, context.world, count, depots, PARCEL_SIZE).map(
      (spot, index): Parcel => ({
        kind: 'parcel',
        id: `${context.id}-parcel-${index}`,
        x: spot.x,
        y: spot.y,
        // Every depot gets something to receive, then the rest fall where they may.
        colour: (depots[index % depots.length] ?? depots[0])?.colour ?? '#f6f0e2',
        home: null,
        carriedBy: null,
      }),
    )
    // ...and shuffled, so the parcel nearest a depot is not always its own.
    for (let index = carryables.length - 1; index > 0; index--) {
      const swap = intRange(rng, 0, index)
      const held = carryables[index]?.colour as string
      ;(carryables[index] as Carryable).colour = carryables[swap]?.colour as string
      ;(carryables[swap] as Carryable).colour = held
    }

    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'sorting',
      id: context.id,
      headline: 'Everything in its own colour!',
      remainingMs: totalMs,
      totalMs,
      zones: depots,
      obstacles: [],
      marks: [],
      carryables,
      outcome: 'running',
      note: null,
      parcels: carryables.length,
    }
  },

  step(objective, state, dtMs) {
    stepCarryables(state, objective.carryables, dtMs)
    // The one rule: a parcel is only home on a spot of its own colour.
    deliverInto(objective.carryables, objective.zones, (thing, zone) => thing.colour === zone.colour)
    if (stillOut(objective.carryables).length === 0) objective.outcome = 'done'
  },

  briefs(objective) {
    const left = stillOut(objective.carryables).length
    const home = objective.parcels - left
    return [
      {
        to: '*',
        headline: objective.headline,
        detail:
          left === 0
            ? 'All sorted!'
            : `${home} of ${objective.parcels} sorted. Match the colours`,
        tone: 'task',
      },
    ]
  },
}
