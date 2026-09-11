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
 * Dodge: a blob caught by a thrown thing loses a life. Nobody is out: losing the last life makes
 * a blob fuzzy — still driving, not hittable — until the task ends. The room wins if anybody is solid.
 */

export interface DodgeObjective extends ObjectiveBase {
  kind: 'dodge'
  lives: Record<string, number>
  /** How long each blob is still safe for after being caught. */
  safeMs: Record<string, number>
  nextMs: number
  everyMs: number
  speed: number
  things: string
  glyph: string
}

export const FUZZY_BADGE = '✨'
export const LIFE_BADGE = '♥'

const LIVES = 3
/** How long after a hit a blob cannot be hit again: one tomato, one life. */
const SAFE_MS = 1_800
/** Slow and sparse enough that a three-year-old can watch one coming and drive out of the way. */
const EVERY = { easy: 1_400, hard: 900 }
const SPEED = { easy: 140, hard: 220 }
const TIME_LIMIT = { easy: 35_000, hard: 45_000 }
const HAZARD_SIZE = 44

/** All of it friendly: nothing here is a weapon. */
export const THROWN = [
  { things: 'tomatoes', glyph: '🍅' },
  { things: 'raindrops', glyph: '💧' },
  { things: 'shirts', glyph: '👕' },
  { things: 'snowballs', glyph: '⚪' },
  { things: 'leaves', glyph: '🍂' },
] as const

export const dodge: ObjectiveTemplate<DodgeObjective> = {
  kind: 'dodge',
  title: 'Dodge',
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
      // A fuzzy blob cannot be hit, and a blob just hit is safe for `SAFE_MS`.
      if (left <= 0 || safe > 0) continue
      if (!objective.hazards.some((hazard) => catches(hazard, player))) continue
      objective.lives[player.playerId] = left - 1
      objective.safeMs[player.playerId] = SAFE_MS
      state.objectives.sounds.push({ to: player.playerId, cue: 'hit' })
    }

    objective.marks = pips(objective.lives, present.map((player) => player.playerId))
    objective.fuzzy = present
      .filter((player) => (objective.lives[player.playerId] ?? LIVES) <= 0)
      .map((player) => player.playerId)

    const solid = present.length - objective.fuzzy.length
    if (objective.remainingMs <= 0) {
      objective.outcome = solid > 0 ? 'done' : 'expired'
      objective.note = solid > 0 ? `${solid} of you dodged the lot!` : 'Everybody got splatted!'
    } else if (solid === 0) {
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

/** Everybody's lives as hearts beside their name, or the fuzzy badge at zero. */
function pips(lives: Record<string, number>, only?: string[]): Mark[] {
  const marks: Mark[] = []
  for (const [playerId, left] of Object.entries(lives)) {
    if (only && !only.includes(playerId)) continue
    if (left <= 0) {
      marks.push({ playerId, badge: FUZZY_BADGE })
      continue
    }
    marks.push({ playerId, badge: LIFE_BADGE.repeat(left) })
  }
  return marks
}

/** A new thing from one edge, always crossing the floor rather than grazing a corner. */
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
