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
import { mergeWalls } from '../obstacles.js'
import { litter } from './arena.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * In order: the house shows the next piece it wants, large, by its picture and colour.
 * A wrong piece is dropped where it stands with a blip, and nothing is lost.
 * Pieces match by look, not by id, so either slice of bread will do.
 */

/** One thing the house is waiting for, as it is drawn on the floor. */
export interface Step {
  glyph?: string
  colour: string
}

export interface InOrderObjective extends ObjectiveBase {
  kind: 'inOrder'
  making: string
  /** What it wants, in order: a picture and a colour, or a colour alone. */
  steps: Step[]
  position: number
}

const TIME_LIMIT = { easy: 70_000, hard: 50_000 }
const WANTED_SIZE = 56

export const inOrder: ObjectiveTemplate<InOrderObjective> = {
  kind: 'inOrder',
  title: 'In order',
  minPlayers: 2,
  minLevel: 7,

  generate(context: GenerateContext): InOrderObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const sequence = pick(rng, SEQUENCES)
    const steps: Step[] = sequence.steps.map((step) => ({ ...step }))

    const across = radiusFor(Math.max(2, context.players.length), 1.3) * 2
    const house: HouseZone = {
      id: `${context.id}-house`,
      shape: 'house',
      width: across,
      height: across * 0.8,
      x: 0,
      y: 0,
      colour: steps[0]?.colour ?? pick(rng, ZONE_COLOURS).hex,
      label: steps[0]?.glyph ?? '',
      labelSize: WANTED_SIZE,
    }
    const at = placeZone(rng, context.world, zoneReach(house), [])
    house.x = at.x
    house.y = at.y

    // After the house and before the pieces, so no wall lands on the house and no piece in a wall.
    const walls = mergeWalls(litter(context, hard, [house]))

    const carryables: Carryable[] = scatter(
      rng,
      context.world,
      sequence.steps.length,
      [house],
      PARCEL_SIZE,
      walls,
    ).map((spot, index): Parcel => {
      const step = steps[index]
      const piece: Parcel = {
        kind: 'parcel',
        id: `${context.id}-piece-${index}`,
        x: spot.x,
        y: spot.y,
        colour: step?.colour ?? '#f6f0e2',
        home: null,
        carriedBy: null,
      }
      // Left off rather than set to '', so the renderer draws no text for a plain piece.
      if (step?.glyph !== undefined) piece.glyph = step.glyph
      return piece
    })

    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'inOrder',
      id: context.id,
      headline: `Make the ${sequence.name}!`,
      remainingMs: totalMs,
      totalMs,
      zones: [house],
      obstacles: walls,
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

    for (const thing of objective.carryables) {
      if (thing.home !== null || thing.kind !== 'parcel' || thing.carriedBy === null) continue
      if (!contains(house, thing.x, thing.y) || wanted(objective, thing)) continue
      state.objectives.sounds.push({ to: thing.carriedBy, cue: 'miss' })
      drop(thing)
    }

    deliverInto(objective.carryables, objective.zones, (thing) => wanted(objective, thing))
    // Only the wanted piece is ever accepted, so position is the count delivered.
    objective.position = objective.carryables.filter((thing) => thing.home !== null).length
    const next = objective.steps[objective.position]
    if (next) {
      house.label = next.glyph ?? ''
      house.colour = next.colour
    }
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

function wanted(objective: InOrderObjective, thing: Carryable): boolean {
  const next = objective.steps[objective.position]
  if (!next) return false
  return thing.colour === next.colour && (thing.glyph ?? '') === (next.glyph ?? '')
}
