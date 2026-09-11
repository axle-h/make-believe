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
import { MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import { pick } from '../rng.js'
import { placeZone, radiusFor, zoneReach, type HouseZone } from '../zones.js'
import { mergeWalls } from '../obstacles.js'
import { litter } from './arena.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Fetch: every themed parcel on the floor is carried into the house. Delivered parcels are not
 * drawn in a heap; the house shows a numeral instead (the renderer's tally).
 */

export interface FetchObjective extends ObjectiveBase {
  kind: 'fetch'
  parcels: number
  /** Plural, and the one word of the headline painted in `thingColour`. */
  things: string
  thingColour: string
  home: string
}

/** Big enough to read across a room. */
const HOME_GLYPH_SIZE = 52

const PARCELS = { easy: 3, hard: 7 }
const TIME_LIMIT = { easy: 60_000, hard: 45_000 }

export const fetch: ObjectiveTemplate<FetchObjective> = {
  kind: 'fetch',
  title: 'Bring it home',
  minPlayers: 2,
  minLevel: 4,

  generate(context: GenerateContext): FetchObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    // Wide enough for the whole room to crowd into at once.
    const across = radiusFor(Math.max(2, context.players.length), 1.4) * 2
    const theme = pick(rng, THEMES)
    const depot: HouseZone = {
      id: `${context.id}-depot`,
      shape: 'house',
      width: across,
      height: across * 0.8,
      x: 0,
      y: 0,
      colour: pick(rng, ZONE_COLOURS).hex,
      label: theme.homeGlyph,
      labelSize: HOME_GLYPH_SIZE,
    }
    const at = placeZone(rng, context.world, zoneReach(depot), [])
    depot.x = at.x
    depot.y = at.y

    // After the house and before the parcels, so no wall lands on the house and no parcel in a wall.
    const walls = mergeWalls(litter(context, hard, [depot]))

    const count = Math.round(scale(PARCELS.easy, PARCELS.hard, hard))
    const carryables: Carryable[] = scatter(
      rng,
      context.world,
      count,
      [depot],
      PARCEL_SIZE,
      walls,
    ).map(
      (spot, index): Parcel => ({
        kind: 'parcel',
        id: `${context.id}-parcel-${index}`,
        x: spot.x,
        y: spot.y,
        colour: theme.colour,
        glyph: theme.glyph,
        home: null,
        carriedBy: null,
      }),
    )
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'fetch',
      id: context.id,
      headline: `Take the ${theme.things} home!`,
      things: theme.things,
      thingColour: theme.colour,
      home: theme.home,
      remainingMs: totalMs,
      totalMs,
      zones: [depot],
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
    deliverInto(objective.carryables, objective.zones, () => true)
    if (stillOut(objective.carryables).length === 0) objective.outcome = 'done'
  },

  briefs(objective) {
    const left = stillOut(objective.carryables).length
    const home = objective.parcels - left
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail:
        left === 0
          ? 'All of it!'
          : `${home} of ${objective.parcels} in the ${objective.home}. Drive into one to pick it up`,
      colour: objective.thingColour,
      emphasis: objective.things,
      tone: 'task',
    }
    return [brief]
  },
}
