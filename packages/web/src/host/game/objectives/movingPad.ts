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

/** The spot that runs away: one pad drifts and bounces off the walls, and everybody present holds on it. */

export interface MovingPadObjective extends ObjectiveBase {
  kind: 'movingPad'
  /** Velocity, in world units a second. */
  vx: number
  vy: number
  holdMs: number
  heldMs: number
}

/** It has to hold the whole room at once. */
const ROOMINESS = { easy: 2.8, hard: 2.2 }
/** Seconds to cross its own width, not a speed, because the pad widens as the room fills. */
const CROSSING = { easy: 4.0, hard: 2.6 }
/** However big the pad gets, it never outruns the room chasing it. */
export const MAX_DRIFT = 180
const HOLD = { easy: 2_500, hard: 3_500 }
const TIME_LIMIT = { easy: 50_000, hard: 40_000 }

export const movingPad: ObjectiveTemplate<MovingPadObjective> = {
  kind: 'movingPad',
  title: 'The spot that runs away',
  minPlayers: 2,
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
    // Never straight along an axis, where it would be a metronome rather than a wander.
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

/** Bounces off the walls rather than wrapping, so it is never lost off one side of the screen. */
function drift(objective: MovingPadObjective, zone: CircleZone, world: World, dtMs: number): void {
  const seconds = Math.max(0, dtMs) / 1000
  zone.x += objective.vx * seconds
  zone.y += objective.vy * seconds

  // Kept wholly on the floor: half a pad off the screen is half a pad nobody can stand on.
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
