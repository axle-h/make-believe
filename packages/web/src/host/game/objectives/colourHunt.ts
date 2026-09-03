import { ASKABLE_PAINTS } from '@make-believe/shared'
import { looksLikePaint } from '../colour.js'
import { MAX_LEVEL } from '../constants.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { Player } from '../state.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Colour hunt. The world names a colour and everybody has to redraw their blob
 * mostly that colour — which is the drawing tool the phone already has, put to
 * work by the whole room at once.
 *
 * There are no turns in it at all, nobody has to read anything, and a
 * three-year-old who can scribble green on a square is contributing exactly as
 * much as anybody else. It is also the first task solved by drawing rather
 * than driving, which is the point of building it.
 *
 * A blob is judged by which crayon its drawing looks most like, never by how
 * close it got: "not green enough" is not a thing this game is allowed to say.
 */

export interface ColourHuntObjective extends ObjectiveBase {
  kind: 'colourHunt'
  /** What everybody is being asked for, as a word and as a colour. */
  paint: string
  paintHex: string
  /**
   * How many drawings each blob had sent when this started. It takes a *new*
   * drawing to count: a blob that happened to be green already has not done
   * anything, and the fun is everybody drawing at the same time.
   */
  before: Record<string, number>
}

/** Drawing takes longer than driving, and the youngest are not quick. */
const TIME_LIMIT = { easy: 90_000, hard: 60_000 }

export const colourHunt: ObjectiveTemplate<ColourHuntObjective> = {
  kind: 'colourHunt',
  title: 'Colour hunt',
  /** One blob painting itself green is not something a room did together. */
  minPlayers: 2,
  /**
   * Well up the ladder. Everybody has to have found the Draw button and had a
   * go with it before being asked to use it against a clock.
   */
  minLevel: 5,

  generate(context: GenerateContext): ColourHuntObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const paint = pick(context.rng, ASKABLE_PAINTS)
    const totalMs = Math.round(
      scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard) * range(context.rng, 0.9, 1.1),
    )
    const objective: ColourHuntObjective = {
      kind: 'colourHunt',
      id: context.id,
      headline: `Everybody go ${paint.name}!`,
      remainingMs: totalMs,
      totalMs,
      zones: [],
      obstacles: [],
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      paint: paint.name,
      paintHex: paint.hex,
      before: {},
    }
    for (const player of context.players) objective.before[player.playerId] = player.skinCount
    return objective
  },

  /**
   * Judged against whoever is here now. A blob that turns up halfway through
   * has to draw like everybody else — it is told the colour the moment it
   * arrives — and one that goes takes its half-finished picture with it.
   */
  step(objective, state) {
    const present = activePlayers(state)
    if (present.length === 0) return
    for (const player of present) {
      objective.before[player.playerId] ??= player.skinCount
    }

    if (present.every((player) => painted(objective, player))) objective.outcome = 'done'
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const done = present.filter((player) => painted(objective, player)).length
    return [
      {
        to: '*',
        headline: objective.headline,
        detail: `${done} of ${present.length} painted. Tap Draw!`,
        colour: objective.paintHex,
        // The colour it is asking for, written in that colour. That word is
        // the whole of the instruction, and it was in the same flat white as
        // the rest of the sentence until the second play test.
        emphasis: objective.paint,
        tone: 'task',
      },
    ]
  },
}

/**
 * Has this blob sent a new drawing, and does it look like the right crayon?
 *
 * "Looks like" counts the colour the blob started as well as what has been
 * drawn on it: the canvas arrives pre-filled in that colour, and a blob that
 * was blue to begin with and has had blue put on it should not be undone by a
 * black face drawn over the top.
 */
function painted(objective: ColourHuntObjective, player: Player): boolean {
  const skin = player.skin
  if (!skin || skin.average === null) return false
  if (player.skinCount <= (objective.before[player.playerId] ?? 0)) return false
  return looksLikePaint(objective.paint, skin.average, player.colour)
}
