import { SEQUENCES } from '@make-believe/shared'
import {
  deliverInto,
  drop,
  scatter,
  stepCarryables,
  PARCEL_SIZE,
  type Carryable,
  type Parcel,
} from '../carryables.js'
import { MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import { pick } from '../rng.js'
import { contains, placeZone, radiusFor, zoneReach, type HouseZone } from '../zones.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * In order. A sandwich is bread, then cheese, then bread; a traffic light is
 * red, amber, green. The pieces are scattered about the floor and the house
 * asks for one at a time, in the only way that needs no reading: it shows the
 * next one, large.
 *
 * The mechanism is nearly free — `deliverInto` already takes a predicate, so
 * "only the next one is accepted" is one function — and the whole of the game
 * is in what happens when somebody brings the wrong thing: it is **dropped
 * where it stands**, with a blip for whoever was carrying it. Not a penalty,
 * not a reset, nothing lost. Just not yet.
 *
 * Matching is by picture rather than by which parcel it is, because a sandwich
 * has two slices of bread and a child who fetched the far one has not made a
 * mistake.
 */

export interface InOrderObjective extends ObjectiveBase {
  kind: 'inOrder'
  /** What it is making, for the headline. */
  making: string
  /** The pictures it wants, in order. */
  steps: string[]
  /** How many of them have arrived. */
  position: number
}

const TIME_LIMIT = { easy: 70_000, hard: 50_000 }
/** The picture on the house is the whole instruction, so it is drawn like one. */
const WANTED_SIZE = 56

export const inOrder: ObjectiveTemplate<InOrderObjective> = {
  kind: 'inOrder',
  title: 'In order',
  /** One blob fetching three things in a row is a queue of one. */
  minPlayers: 2,
  /** Everything about it is fetch with one rule on top, so it comes after. */
  minLevel: 7,

  generate(context: GenerateContext): InOrderObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const sequence = pick(rng, SEQUENCES)
    const steps = sequence.steps.map((step) => step.glyph)

    const across = radiusFor(Math.max(2, context.players.length), 1.3) * 2
    const house: HouseZone = {
      id: `${context.id}-house`,
      shape: 'house',
      width: across,
      height: across * 0.8,
      x: 0,
      y: 0,
      colour: pick(rng, ZONE_COLOURS).hex,
      // What it wants next, and nothing else. It is the instruction.
      label: steps[0] ?? '',
      labelSize: WANTED_SIZE,
    }
    const at = placeZone(rng, context.world, zoneReach(house), [])
    house.x = at.x
    house.y = at.y

    const carryables: Carryable[] = scatter(
      rng,
      context.world,
      sequence.steps.length,
      [house],
      PARCEL_SIZE,
    ).map(
      (spot, index): Parcel => ({
        kind: 'parcel',
        id: `${context.id}-piece-${index}`,
        x: spot.x,
        y: spot.y,
        colour: sequence.steps[index]?.colour ?? '#f6f0e2',
        glyph: sequence.steps[index]?.glyph ?? '',
        home: null,
        carriedBy: null,
      }),
    )

    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'inOrder',
      id: context.id,
      headline: `Make the ${sequence.name}!`,
      remainingMs: totalMs,
      totalMs,
      zones: [house],
      obstacles: [],
      marks: [],
      carryables,
      outcome: 'running',
      note: null,
      making: sequence.name,
      steps,
      position: 0,
    }
  },

  step(objective, state, dtMs) {
    stepCarryables(state, objective.carryables, dtMs)
    const house = objective.zones[0]
    if (!house) return

    // Anything brought in out of turn is put down where it stands. The blip is
    // for the child who carried it: "not yet" is worth hearing without having
    // to look up, and it is the only thing that happens.
    for (const thing of objective.carryables) {
      if (thing.home !== null || thing.kind !== 'parcel' || thing.carriedBy === null) continue
      if (!contains(house, thing.x, thing.y) || wanted(objective, thing)) continue
      state.objectives.sounds.push({ to: thing.carriedBy, cue: 'miss' })
      drop(thing)
    }

    deliverInto(objective.carryables, objective.zones, (thing) => wanted(objective, thing))
    // The house only ever accepts the thing it is showing, so how far along
    // the room is is simply how much of it has arrived.
    objective.position = objective.carryables.filter((thing) => thing.home !== null).length
    house.label = objective.steps[objective.position] ?? house.label ?? ''
    if (objective.position >= objective.steps.length) objective.outcome = 'done'
  },

  briefs(objective) {
    const left = objective.steps.length - objective.position
    return [
      {
        to: '*',
        headline: objective.headline,
        detail:
          left === 0
            ? 'Done!'
            : `${objective.position} of ${objective.steps.length}. The house shows what it wants next`,
        tone: 'task',
      },
    ]
  },
}

/** Is this the picture the house is asking for right now? */
function wanted(objective: InOrderObjective, thing: Carryable): boolean {
  return thing.glyph !== undefined && thing.glyph === objective.steps[objective.position]
}
