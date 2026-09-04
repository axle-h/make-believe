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
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Fetch. Parcels are scattered about the floor and all of them have to reach
 * the depot before the timer runs out.
 *
 * It is the first task built out of carrying, and the friendliest one: it is
 * entirely parallel, so nobody waits for anybody, and the youngest player in
 * the room can genuinely bring one back on their own and be the reason it was
 * finished.
 */

export interface FetchObjective extends ObjectiveBase {
  kind: 'fetch'
  /** How many there were to start with, so the brief can count them down. */
  parcels: number
  /** What they are, plural, for the one word of the headline that is painted. */
  things: string
  thingColour: string
  /** And where they go — a basket, a postbox — for the line underneath it. */
  home: string
}

/** Big enough to read across a room: the picture on the house *is* the answer. */
const HOME_GLYPH_SIZE = 52

/** How many to fetch: an armful at first, a proper job later. */
const PARCELS = { easy: 3, hard: 7 }
const TIME_LIMIT = { easy: 60_000, hard: 45_000 }

export const fetch: ObjectiveTemplate<FetchObjective> = {
  kind: 'fetch',
  title: 'Bring it home',
  /** Carrying things back one at a time is a chore alone and a job shared. */
  minPlayers: 2,
  minLevel: 4,

  generate(context: GenerateContext): FetchObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    // A house rather than a spot on the floor: "take it home" is a sentence a
    // three-year-old already has, and a roof says it without a word of the
    // brief being read. It is squarish and wide enough for the whole room to
    // crowd into at once, because they will.
    const across = radiusFor(Math.max(2, context.players.length), 1.4) * 2
    // What is being carried, and where to. It is the same game either way, but
    // apples in a basket is funnier than parcels in a depot and a good deal
    // easier to understand without reading a word of it.
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

    const count = Math.round(scale(PARCELS.easy, PARCELS.hard, hard))
    const carryables: Carryable[] = scatter(rng, context.world, count, [depot], PARCEL_SIZE).map(
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
    deliverInto(objective.carryables, objective.zones, () => true)
    if (stillOut(objective.carryables).length === 0) objective.outcome = 'done'
  },

  briefs(objective) {
    const left = stillOut(objective.carryables).length
    const home = objective.parcels - left
    // The word for what they are, painted in the colour they are: the one word
    // of the sentence that says what to go and look for.
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
