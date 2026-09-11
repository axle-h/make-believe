import { DRAWABLE_WORDS } from '@make-believe/shared'
import { MAX_LEVEL } from '../constants.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState } from '../state.js'
import { guessMatches } from './guessing.js'
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
 * Draw it: one phone is told privately what to draw on its blob, and the others guess with Say.
 * It is not a turn: the artist can still drive, say, draw and finish, and nothing waits on them.
 */

export interface DrawItObjective extends ObjectiveBase {
  kind: 'drawIt'
  /** On exactly one phone, and never on the TV. */
  word: string
  artist: string | null
  guesser: string | null
}

export const PENCIL = '✏️'

const TIME_LIMIT = { easy: 120_000, hard: 95_000 }

export const drawIt: ObjectiveTemplate<DrawItObjective> = {
  kind: 'drawIt',
  title: 'Draw it',
  minPlayers: 2,
  minLevel: 6,

  generate(context: GenerateContext): DrawItObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const artist = pick(rng, context.players)
    const totalMs = Math.round(
      scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard) * range(rng, 0.9, 1.1),
    )
    return {
      kind: 'drawIt',
      id: context.id,
      headline: 'Guess what it is!',
      remainingMs: totalMs,
      totalMs,
      zones: [],
      obstacles: [],
      marks: [{ playerId: artist.playerId, badge: PENCIL }] satisfies Mark[],
      carryables: [],
      outcome: 'running',
      note: null,
      word: pick(rng, DRAWABLE_WORDS),
      artist: artist.playerId,
      guesser: null,
    }
  },

  /** Judged against whoever is present: an away artist's pencil, and the word, go to somebody here. */
  step(objective, state) {
    const present = activePlayers(state)
    if (present.length === 0) return

    if (!present.some((player) => player.playerId === objective.artist)) {
      const artist = pick(state.objectives.rng, present)
      objective.artist = artist.playerId
      objective.marks = [{ playerId: artist.playerId, badge: PENCIL }]
    }

    // Say what it was; the director calls it expired a moment later.
    if (objective.remainingMs <= 0 && objective.outcome === 'running') {
      objective.note = `It was a ${objective.word}!`
    }
  },

  /** Only the artist's brief carries the word; the shared one goes to the TV. */
  briefs(objective, state) {
    const present = activePlayers(state)
    const artist = present.find((player) => player.playerId === objective.artist)
    const shared: Brief = {
      to: '*',
      headline: objective.headline,
      detail: artist ? `${artist.name} is drawing it. Say what you think!` : 'Somebody is drawing…',
      tone: 'task',
    }
    if (artist) shared.colour = artist.colour
    if (!artist) return [shared]
    return [
      shared,
      {
        to: artist.playerId,
        headline: `Draw a ${objective.word}!`,
        detail: 'Tap Draw. Everybody else has to guess it.',
        tone: 'task',
      },
    ]
  },

  /** Any Say from anybody but the artist is a guess; the text is still an ordinary bubble. */
  observe(objective, state, message) {
    if (objective.outcome !== 'running') return
    if (message.type !== 'text') return
    if (message.playerId === objective.artist) return
    if (!guessMatches(message.value, objective.word)) return

    objective.guesser = message.playerId
    objective.outcome = 'done'
    objective.note = `${nameOf(state, message.playerId)} got it: ${objective.word}!`
  },
}

function nameOf(state: GameState, playerId: string): string {
  return state.players.get(playerId)?.name ?? 'Somebody'
}
