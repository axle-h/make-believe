import { MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { World } from '../state.js'
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
 * The spot, but it will not stay still. One pad drifts across the floor and
 * bounces off the walls, and everybody has to be on it — and stay on it — for
 * a good long moment while it wanders.
 *
 * It is the smallest thing that can be made out of a floor that moves, which
 * is the point of building it first: everything that comes after moves
 * something. A three-year-old understands it from the picture, exactly as they
 * understand standing on a spot, and the difference is entirely in the legs.
 */

export interface MovingPadObjective extends ObjectiveBase {
  kind: 'movingPad'
  /** Where it is going, in world units a second. */
  vx: number
  vy: number
  holdMs: number
  heldMs: number
}

/** Elbow room for the whole room at once: it has to hold everybody. */
const ROOMINESS = { easy: 2.0, hard: 1.5 }
/**
 * How long it takes to cross its own width, in seconds — which is the number
 * that matters rather than a speed. Below the hold, and standing still cannot
 * work: the pad passes over anybody who does not move and is gone again before
 * the count is up. A speed on its own would break that promise the moment a
 * room of ten made the pad bigger.
 */
const CROSSING = { easy: 2.6, hard: 1.2 }
/** However big the pad gets, it never outruns the room chasing it. */
const MAX_DRIFT = 300
/** How long everybody has to keep up with it. Longer than a crossing, always. */
const HOLD = { easy: 4_000, hard: 5_000 }
const TIME_LIMIT = { easy: 50_000, hard: 40_000 }

export const movingPad: ObjectiveTemplate<MovingPadObjective> = {
  kind: 'movingPad',
  title: 'The spot that runs away',
  /** One blob following a circle about is a chore; a room doing it is a game. */
  minPlayers: 2,
  /** Straight after standing on one, because it is the same task with legs. */
  minLevel: 2,

  generate(context: GenerateContext): MovingPadObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const roominess = scale(ROOMINESS.easy, ROOMINESS.hard, hard) * range(rng, 0.94, 1.06)
    const radius = radiusFor(Math.max(2, context.players.length), roominess)
    const at = placeZone(rng, context.world, radius, [])
    const zone: CircleZone = {
      id: `${context.id}-pad`,
      shape: 'circle',
      x: at.x,
      y: at.y,
      radius,
      colour: pick(rng, ZONE_COLOURS).hex,
    }
    // Any direction at all, but never straight along an axis: a pad sliding
    // flat across the screen and back is a metronome rather than a wander.
    const heading = range(rng, 0.35, 1.2) * (rng.next() < 0.5 ? 1 : -1)
    const speed = Math.min(MAX_DRIFT, (radius * 2) / scale(CROSSING.easy, CROSSING.hard, hard))
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'movingPad',
      id: context.id,
      headline: 'Stay on the spot!',
      remainingMs: totalMs,
      totalMs,
      zones: [zone],
      obstacles: [],
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      vx: Math.cos(heading) * speed * (rng.next() < 0.5 ? 1 : -1),
      vy: Math.sin(heading) * speed,
      holdMs: Math.round(scale(HOLD.easy, HOLD.hard, hard)),
      heldMs: 0,
    }
  },

  step(objective, state, dtMs) {
    const zone = objective.zones[0]
    if (!zone || zone.shape !== 'circle') return
    drift(objective, zone, state.world, dtMs)

    const present = activePlayers(state)
    if (present.length === 0) return
    const everybody = blobsIn(zone, present).length === present.length
    if (hold(objective, everybody, dtMs)) objective.outcome = 'done'
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const zone = objective.zones[0]
    const onIt = zone ? blobsIn(zone, present).length : 0
    const holding = present.length > 0 && onIt === present.length
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: holding ? `Hold it… ${secondsLeft(objective)}` : `${onIt} of ${present.length} on it`,
      tone: 'task',
    }
    if (zone) brief.colour = zone.colour
    return [brief]
  },
}

/**
 * The pad, a moment later. It bounces off the walls rather than wrapping: a
 * spot that leaves one side of the screen and appears at the other is a spot
 * six children lose, and this way it stays somewhere they can chase it to.
 */
function drift(objective: MovingPadObjective, zone: CircleZone, world: World, dtMs: number): void {
  const seconds = Math.max(0, dtMs) / 1000
  zone.x += objective.vx * seconds
  zone.y += objective.vy * seconds

  // Wholly on the floor, always: half a pad off the screen is half a pad
  // nobody can stand on.
  if (zone.x < zone.radius) {
    zone.x = zone.radius
    objective.vx = Math.abs(objective.vx)
  } else if (zone.x > world.width - zone.radius) {
    zone.x = world.width - zone.radius
    objective.vx = -Math.abs(objective.vx)
  }
  if (zone.y < zone.radius) {
    zone.y = zone.radius
    objective.vy = Math.abs(objective.vy)
  } else if (zone.y > world.height - zone.radius) {
    zone.y = world.height - zone.radius
    objective.vy = -Math.abs(objective.vy)
  }
}
