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
 * Hot potato. One blob has it, touching somebody else passes it on, and
 * whoever is holding it when the buzzer goes is the one everybody laughs at.
 *
 * It is the first task that is not cooperative, which is what proves the
 * director is not shaped only around everybody wanting the same thing.
 *
 * It has walls on the floor. A chase across an empty room is a straight line
 * and whoever is quickest wins it; a chase around a block is a game, because
 * the blob being chased can turn a corner. The walls appear with the task, and
 * anybody standing where one lands is slid out of the way over a few frames
 * rather than jumped somewhere else. Keep the crown is the same chase inside
 * out and shares them; they live in `arena.ts`.
 *
 * Nobody is eliminated, nothing is taken away, and the score still goes up at
 * the end — being caught with it is the joke, not a punishment. The youngest
 * player is three.
 */

export interface HotPotatoObjective extends ObjectiveBase {
  kind: 'hotPotato'
  /** Whoever is holding it, or `null` for the instant before anybody is. */
  it: string | null
  /** How long a fresh hold lasts before a touch can pass it on again. */
  graceMs: number
  /** How long the current blob has had it. */
  heldForMs: number
}

/** The potato itself, worn by whoever has it. */
export const POTATO = '🥔'

/** How long you are safe for after catching it. Long enough to get away. */
const GRACE = { easy: 1_200, hard: 700 }
/** How long the whole thing lasts before somebody is caught with it. */
const TIME_LIMIT = { easy: 30_000, hard: 18_000 }

export const hotPotato: ObjectiveTemplate<HotPotatoObjective> = {
  kind: 'hotPotato',
  title: 'Hot potato',
  /**
   * Three. Two blobs is not a chase but a tag-back: touch, be touched, touch
   * again, and the potato does nothing but flicker between the only two blobs
   * there are. It wants somebody to run *to* as well as somebody to run from.
   */
  minPlayers: 3,
  /**
   * Not the first thing a room is ever asked to do. Everybody stands on a spot
   * together for a while first, which teaches the joystick; being chased is
   * more fun once driving is not the hard part.
   */
  minLevel: 2,

  generate(context: GenerateContext): HotPotatoObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const start = pick(rng, context.players)
    // A little jiggle either way, so two goes at the same level are not twins.
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

  /**
   * Judged against whoever is here *now*. A phone that has been put down takes
   * its blob out of the chase, and if it was the one holding the potato the
   * potato has to land somewhere else — a task that ended because a
   * three-year-old wandered off with it would end most of the time.
   */
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

    // The buzzer is the end of it rather than a failure to finish in time, so
    // this says so itself before the director can call it a miss.
    if (objective.remainingMs <= 0) {
      objective.outcome = 'done'
      objective.note = `${nameOf(state, objective.it) ?? 'Somebody'} was left holding it!`
      // Nobody is dangerous once it is over; being caught with it is the joke.
      objective.danger = []
    }
  },

  briefs(objective, state) {
    const holder = activePlayers(state).find((player) => player.playerId === objective.it)
    // Everybody gets the same line, so it has to read the same to the blob
    // being chased as to the one doing the chasing: it says who has it and
    // leaves the running to them. Telling each phone its own half of a task is
    // a trick worth having, and worth spending on a task built around it.
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      // "run away" rather than only who has it: the room has to be told what
      // to *do* about the blob whose name is in the line, and the TV is where
      // heads are up.
      detail: holder ? `${holder.name} has it — run away!` : 'Nobody has it…',
      tone: 'task',
    }
    // The strip goes the colour of whoever is holding it, so a child who
    // cannot read the name still sees it change hands.
    if (holder) brief.colour = holder.colour
    return [brief]
  },
}

/** Give it to somebody, and start their few seconds of safety again. */
function handTo(objective: HotPotatoObjective, playerId: string): void {
  objective.it = playerId
  objective.heldForMs = 0
  objective.marks = marksFor(playerId)
  // And the TV rings them, which is the half of it a child who cannot read
  // can see. It follows the potato and goes the moment the task is over.
  objective.danger = [playerId]
}

function marksFor(playerId: string): Mark[] {
  return [{ playerId, badge: POTATO }]
}

function nameOf(state: GameState, playerId: string | null): string | null {
  if (playerId === null) return null
  return state.players.get(playerId)?.name ?? null
}
