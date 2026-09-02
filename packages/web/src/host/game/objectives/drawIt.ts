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
 * Draw it. One phone is told privately what to draw; everybody else says what
 * they think it is, and the TV listens. Drawings are already blob skins, so
 * the thing being guessed is standing in the middle of the floor wearing it.
 *
 * This is the task that comes closest to a turn, so it is built to not be one:
 * the artist is not *in* anything they have to get out of — they can drive,
 * talk, redraw and finish throughout — and everybody else is doing what they
 * could do anyway, which is shouting at the television. If the artist puts
 * their phone down, the pencil is quietly handed to somebody else.
 */

export interface DrawItObjective extends ObjectiveBase {
  kind: 'drawIt'
  /** What it is. This is on exactly one phone and never on the TV. */
  word: string
  /** Whose turn it is with the pencil. */
  artist: string | null
  /** Who got it, once somebody has. */
  guesser: string | null
}

/** Worn by whoever is drawing, so the room knows whose blob to watch. */
const PENCIL = '✏️'

/** Long enough to draw something and for the room to shout at it. */
const TIME_LIMIT = { easy: 75_000, hard: 55_000 }

export const drawIt: ObjectiveTemplate<DrawItObjective> = {
  kind: 'drawIt',
  /** One to draw and at least one to guess. */
  minPlayers: 2,
  /**
   * The last thing unlocked. It asks a child to type, which is the slowest
   * thing a phone can ask for, so a room only meets it once it is good at
   * everything quicker.
   */
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
      marks: [{ playerId: artist.playerId, badge: PENCIL }] satisfies Mark[],
      carryables: [],
      outcome: 'running',
      note: null,
      word: pick(rng, DRAWABLE_WORDS),
      artist: artist.playerId,
      guesser: null,
    }
  },

  /**
   * The pencil follows whoever is here. A phone put down mid-drawing would
   * otherwise leave a room guessing at a blob nobody is drawing, so it goes to
   * somebody else and the word goes with it.
   */
  step(objective, state) {
    const present = activePlayers(state)
    if (present.length === 0) return

    if (!present.some((player) => player.playerId === objective.artist)) {
      const artist = pick(state.objectives.rng, present)
      objective.artist = artist.playerId
      objective.marks = [{ playerId: artist.playerId, badge: PENCIL }]
    }

    // Time is nearly up: say what it was, rather than leaving a room that
    // never got it wondering. The director calls it expired a moment later.
    if (objective.remainingMs <= 0 && objective.outcome === 'running') {
      objective.note = `It was a ${objective.word}!`
    }
  },

  /**
   * Everybody hears the same thing except the one holding the pencil, who is
   * the only place in the world the word is written down. The TV must not say
   * it: half the room is looking at the TV.
   */
  briefs(objective, state) {
    const present = activePlayers(state)
    const artist = present.find((player) => player.playerId === objective.artist)
    const shared: Brief = {
      to: '*',
      headline: objective.headline,
      detail: artist ? `${artist.name} is drawing it — say what you think!` : 'Somebody is drawing…',
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

  /**
   * Somebody said something. Anybody but the artist can guess, at any moment,
   * without anything having been handed to them — the Say box is the Say box,
   * and it works exactly as it does when the world is asking for nothing.
   */
  observe(objective, state, message) {
    if (objective.outcome !== 'running') return
    if (message.type !== 'text') return
    if (message.playerId === objective.artist) return
    if (!guessMatches(message.value, objective.word)) return

    objective.guesser = message.playerId
    objective.outcome = 'done'
    objective.note = `${nameOf(state, message.playerId)} got it — ${objective.word}!`
  },
}

function nameOf(state: GameState, playerId: string): string {
  return state.players.get(playerId)?.name ?? 'Somebody'
}
