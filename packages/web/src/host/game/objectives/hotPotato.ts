import { nearestTouching } from '../collisions.js'
import { walls } from './arena.js'
import { MAX_LEVEL } from '../constants.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState } from '../state.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type Mark,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Hot potato: touching somebody passes it on, and whoever holds it at the buzzer is the joke.
 * Being caught with it still ends the task as done, so the score goes up either way.
 */

export interface HotPotatoObjective extends ObjectiveBase {
  kind: 'hotPotato'
  it: string | null
  /** How long a fresh hold lasts before a touch can pass it on again. */
  graceMs: number
  heldForMs: number
}

export const POTATO = '🥔'

const GRACE = { easy: 1_200, hard: 700 }
const TIME_LIMIT = { easy: 30_000, hard: 18_000 }

export const hotPotato: ObjectiveTemplate<HotPotatoObjective> = {
  kind: 'hotPotato',
  title: 'Hot potato',
  // Two blobs would only tag each other back and forth.
  minPlayers: 3,
  minLevel: 2,

  generate(context: GenerateContext): HotPotatoObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const start = pick(rng, context.players)
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard) * range(rng, 0.9, 1.1))
    return {
      kind: 'hotPotato',
      id: context.id,
      headline: 'Hot potato!',
      remainingMs: totalMs,
      totalMs,
      zones: [],
      obstacles: walls(context, hard),
      marks: marksFor(start.playerId),
      carryables: [],
      outcome: 'running',
      note: null,
      danger: [start.playerId],
      it: start.playerId,
      graceMs: Math.round(scale(GRACE.easy, GRACE.hard, hard)),
      heldForMs: 0,
    }
  },

  /** Judged against whoever is present: an away holder's potato goes to somebody who is here. */
  step(objective, state, dtMs) {
    const present = activePlayers(state)
    if (present.length === 0) return

    const holder = present.find((player) => player.playerId === objective.it)
    if (!holder) {
      handTo(objective, pick(state.objectives.rng, present).playerId)
      return
    }

    objective.heldForMs += dtMs
    if (objective.heldForMs >= objective.graceMs) {
      const caught = nearestTouching(holder, present)
      if (caught) handTo(objective, caught.playerId)
    }

    // The buzzer ends it as done, before the director can call it a miss.
    if (objective.remainingMs <= 0) {
      objective.outcome = 'done'
      objective.note = `${nameOf(state, objective.it) ?? 'Somebody'} was left holding it!`
      objective.danger = []
    }
  },

  briefs(objective, state) {
    const holder = activePlayers(state).find((player) => player.playerId === objective.it)
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: holder ? `${holder.name} has it — run away!` : 'Nobody has it…',
      tone: 'task',
    }
    // The strip takes the holder's colour, so a child who cannot read sees it change hands.
    if (holder) brief.colour = holder.colour
    return [brief]
  },
}

/** Hand it over, and restart the new holder's grace period. */
function handTo(objective: HotPotatoObjective, playerId: string): void {
  objective.it = playerId
  objective.heldForMs = 0
  objective.marks = marksFor(playerId)
  // The TV rings the holder, until the task ends.
  objective.danger = [playerId]
}

function marksFor(playerId: string): Mark[] {
  return [{ playerId, badge: POTATO }]
}

function nameOf(state: GameState, playerId: string | null): string | null {
  if (playerId === null) return null
  return state.players.get(playerId)?.name ?? null
}
