import { MAX_LEVEL } from '../constants.js'
import { catches, stepHazards, type Hazard } from '../hazards.js'
import { intRange, range, type Rng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { World } from '../state.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type Mark,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Dodge. Things drift across the floor and a blob that is caught by one loses
 * a life. At zero it goes **fuzzy**: still driving, no longer hittable, and no
 * longer fuzzy the instant the task is over.
 *
 * That is the shape every "you are out" idea has to take here. Nobody is ever
 * eliminated and no task may put a child in a state they cannot drive out of,
 * so being hit three times is somewhere to drive about rather than a chair to
 * sit on — the same shape as being shoved off the sumo island.
 *
 * The room wins if anybody is still solid at the buzzer, which means the
 * youngest player hiding in a corner all game is a perfectly good plan and a
 * contribution.
 */

export interface DodgeObjective extends ObjectiveBase {
  kind: 'dodge'
  /** What is left of everybody's three, by `playerId`. */
  lives: Record<string, number>
  /** How long each blob is still safe for after being caught, in ms. */
  safeMs: Record<string, number>
  /** How long until the next thing comes over. */
  nextMs: number
  /** How often they come, and how fast, at this level. */
  everyMs: number
  speed: number
  /** What is being thrown, for the brief and for the pictures. */
  things: string
  glyph: string
}

/** Everybody starts with three. */
const LIVES = 3
/** How long after a hit a blob cannot be hit again: one tomato, one life. */
const SAFE_MS = 1_200
/** How often something comes over, and how fast it crosses. */
const EVERY = { easy: 900, hard: 420 }
const SPEED = { easy: 200, hard: 330 }
const TIME_LIMIT = { easy: 35_000, hard: 45_000 }
const HAZARD_SIZE = 44

/** What is being thrown. All of it friendly: nothing here is a weapon. */
const THROWN = [
  { things: 'tomatoes', glyph: '🍅' },
  { things: 'raindrops', glyph: '💧' },
  { things: 'socks', glyph: '🧦' },
  { things: 'snowballs', glyph: '⚪' },
  { things: 'leaves', glyph: '🍂' },
] as const

export const dodge: ObjectiveTemplate<DodgeObjective> = {
  kind: 'dodge',
  title: 'Dodge',
  /** One blob dodging on its own is a screensaver. */
  minPlayers: 2,
  minLevel: 5,

  generate(context: GenerateContext): DodgeObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const kind = THROWN[intRange(rng, 0, THROWN.length - 1)] ?? THROWN[0]
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    const lives: Record<string, number> = {}
    for (const player of context.players) lives[player.playerId] = LIVES

    return {
      kind: 'dodge',
      id: context.id,
      headline: `Dodge the ${kind.things}!`,
      remainingMs: totalMs,
      totalMs,
      zones: [],
      obstacles: [],
      marks: pips(lives),
      carryables: [],
      hazards: [],
      fuzzy: [],
      outcome: 'running',
      note: null,
      lives,
      safeMs: {},
      nextMs: 0,
      everyMs: Math.round(scale(EVERY.easy, EVERY.hard, hard)),
      speed: Math.round(scale(SPEED.easy, SPEED.hard, hard)),
      things: kind.things,
      glyph: kind.glyph,
    }
  },

  step(objective, state, dtMs) {
    const present = activePlayers(state)
    if (present.length === 0) return
    // A blob that arrived halfway through gets its three like everybody else.
    for (const player of present) objective.lives[player.playerId] ??= LIVES

    objective.hazards = stepHazards(objective.hazards ?? [], state.world, dtMs)
    objective.nextMs -= dtMs
    if (objective.nextMs <= 0) {
      objective.nextMs = objective.everyMs
      objective.hazards.push(thrownAt(objective, state.objectives.rng, state.world))
    }

    for (const player of present) {
      const safe = Math.max(0, (objective.safeMs[player.playerId] ?? 0) - dtMs)
      objective.safeMs[player.playerId] = safe
      const left = objective.lives[player.playerId] ?? LIVES
      // A fuzzy blob is not there to be hit, and neither is one that has just
      // been: one tomato may cost one life and no more.
      if (left <= 0 || safe > 0) continue
      if (!objective.hazards.some((hazard) => catches(hazard, player))) continue
      objective.lives[player.playerId] = left - 1
      objective.safeMs[player.playerId] = SAFE_MS
      // You feel your own hit without looking down, which is the one place all
      // evening where a private signal genuinely earns itself.
      state.objectives.sounds.push({ to: player.playerId, cue: 'hit' })
    }

    objective.marks = pips(objective.lives, present.map((player) => player.playerId))
    objective.fuzzy = present
      .filter((player) => (objective.lives[player.playerId] ?? LIVES) <= 0)
      .map((player) => player.playerId)

    const solid = present.length - objective.fuzzy.length
    if (objective.remainingMs <= 0) {
      // Anybody still standing wins it for the room.
      objective.outcome = solid > 0 ? 'done' : 'expired'
      objective.note = solid > 0 ? `${solid} of you dodged the lot!` : 'Everybody got splatted!'
    } else if (solid === 0) {
      // Nothing left to dodge for. Cheerful, and out of the way.
      objective.outcome = 'expired'
      objective.note = 'Everybody got splatted!'
    }
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const fuzzy = new Set(objective.fuzzy ?? [])
    const solid = present.filter((player) => !fuzzy.has(player.playerId)).length
    return [
      {
        to: '*',
        headline: objective.headline,
        detail: `${solid} of ${present.length} still going. Three lives each!`,
        tone: 'task',
      },
    ]
  },
}

/** Everybody's lives, as hearts beside their name. */
function pips(lives: Record<string, number>, only?: string[]): Mark[] {
  const marks: Mark[] = []
  for (const [playerId, left] of Object.entries(lives)) {
    if (only && !only.includes(playerId)) continue
    if (left <= 0) {
      // Fuzzy rather than out: it is a thing to drive about in, not a chair.
      marks.push({ playerId, badge: '✨' })
      continue
    }
    marks.push({ playerId, badge: '♥'.repeat(left) })
  }
  return marks
}

/**
 * One more thing on its way over, from an edge and across the floor. It always
 * crosses rather than grazing a corner, so everything that appears is
 * something somebody has to get out of the way of.
 */
function thrownAt(objective: DodgeObjective, rng: Rng, world: World): Hazard {
  const fromLeft = rng.next() < 0.5
  const across = rng.next() < 0.5
  const speed = objective.speed * range(rng, 0.85, 1.15)
  const along = range(rng, -0.35, 0.35)

  const spot = across
    ? { x: fromLeft ? -HAZARD_SIZE : world.width + HAZARD_SIZE, y: range(rng, 40, world.height - 40) }
    : { x: range(rng, 40, world.width - 40), y: fromLeft ? -HAZARD_SIZE : world.height + HAZARD_SIZE }
  const way = fromLeft ? 1 : -1

  return {
    id: `${objective.id}-thrown-${Math.round(objective.remainingMs)}-${Math.round(spot.x)}`,
    x: spot.x,
    y: spot.y,
    vx: across ? speed * way : speed * along,
    vy: across ? speed * along : speed * way,
    size: HAZARD_SIZE,
    glyph: objective.glyph,
  }
}
