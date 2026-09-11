import {
  deliverInto,
  scatter,
  stepCarryables,
  stillOut,
  PARCEL_SIZE,
  type Carryable,
  type Parcel,
} from '../carryables.js'
import { THEMES } from '@make-believe/shared'
import { MAX_LEVEL } from '../constants.js'
import { intRange, pick } from '../rng.js'
import type { CircleZone } from '../zones.js'
import { makePads, MAX_NAMED_PADS, nameOfColour } from './pads.js'
import { mergeWalls } from '../obstacles.js'
import { litter } from './arena.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/** Sorting: fetch, but each coloured parcel is only home on the depot of its own colour. */

export interface SortingObjective extends ObjectiveBase {
  kind: 'sorting'
  parcels: number
}

const DEPOTS = { easy: 2, hard: 3 }
const PARCELS = { easy: 4, hard: 6 }
const TIME_LIMIT = { easy: 70_000, hard: 55_000 }

export const sorting: ObjectiveTemplate<SortingObjective> = {
  kind: 'sorting',
  title: 'Sorting',
  minPlayers: 2,
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
    for (const depot of depots) depot.label = nameOfColour(depot.colour).toUpperCase()

    // The colour is the rule; the theme's glyph only rides on top of it.
    const theme = pick(rng, THEMES)
    // After the depots and before the parcels, so no wall lands on a depot and no parcel in a wall.
    const walls = mergeWalls(litter(context, hard, depots))

    const count = Math.round(scale(PARCELS.easy, PARCELS.hard, hard))
    const carryables: Carryable[] = scatter(
      rng,
      context.world,
      count,
      depots,
      PARCEL_SIZE,
      walls,
    ).map(
      (spot, index): Parcel => ({
        kind: 'parcel',
        id: `${context.id}-parcel-${index}`,
        x: spot.x,
        y: spot.y,
        // Every depot gets something to receive, then the rest fall where they may.
        colour: (depots[index % depots.length] ?? depots[0])?.colour ?? '#f6f0e2',
        glyph: theme.glyph,
        home: null,
        carriedBy: null,
      }),
    )
    // Shuffled, so the parcel nearest a depot is not always its own.
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
      headline: `Every ${theme.one} in its own colour!`,
      remainingMs: totalMs,
      totalMs,
      zones: depots,
      obstacles: walls,
      marks: [],
      carryables,
      outcome: 'running',
      note: null,
      parcels: carryables.length,
    }
  },

  step(objective, state, dtMs) {
    stepCarryables(state, objective.carryables, dtMs)
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
