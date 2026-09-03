import { nearestTouching } from '../collisions.js'
import { CROWN_BADGE, MAX_LEVEL } from '../constants.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState, Player } from '../state.js'
import { secondsLeft } from './hold.js'
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
 * Keep the crown. One blob is wearing it, wearing it is what counts, and
 * driving into whoever has it takes it off them.
 *
 * It is hot potato inside out, and that is the point of having both: there
 * everybody runs from the blob holding the thing, here everybody runs at them.
 * The crown is a mark rather than anything on the floor — the same badge worn
 * beside a blob's name that the potato is — because a thing you keep by
 * running away with it is a thing that has to move exactly as fast as you do.
 *
 * Nobody is eliminated and nothing is taken away for good: a crown lost is a
 * crown that can be taken straight back, and the time already worn stays
 * banked, so a child who has it stolen has not lost what they had.
 *
 * **And it outlives the game.** Whoever wins it wears it between tasks and
 * into the next one, until somebody takes it off them; the room comes back to
 * the same blob and the headline says whose it is. One badge that lasts thirty
 * seconds is much like another, and a badge that is still there two games
 * later is a title.
 */

export interface KeepTheCrownObjective extends ObjectiveBase {
  kind: 'keepTheCrown'
  /** Whoever is wearing it, or `null` for the instant before anybody is. */
  wearer: string | null
  /** How long it has to be worn, all told, to win it outright. */
  crownMs: number
  /** How long each blob has worn it so far. */
  wornMs: Record<string, number>
  /** How long a fresh crown stays put before a touch can take it. */
  graceMs: number
  /** How long this go has lasted. */
  heldForMs: number
}

/** How long it takes to win it outright. */
const CROWN_TIME = { easy: 7_000, hard: 11_000 }
/** How long you are safe for after taking it. Long enough to get away. */
const GRACE = { easy: 1_200, hard: 700 }
/** How long the whole thing lasts if nobody manages to keep it that long. */
const TIME_LIMIT = { easy: 40_000, hard: 34_000 }

export const keepTheCrown: ObjectiveTemplate<KeepTheCrownObjective> = {
  kind: 'keepTheCrown',
  title: 'Keep the crown',
  /** Two: one to wear it and one to come and take it. */
  minPlayers: 2,
  /**
   * The top of the ladder, and the only thing that unlocks there — a room that
   * has got this far has been playing for a while and can drive properly,
   * which is what a chase where you are the one being chased asks for.
   */
  minLevel: MAX_LEVEL,

  generate(context: GenerateContext): KeepTheCrownObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    // Whoever is already wearing it starts wearing it, which is the whole of
    // what makes the crown a title: the room comes back to take it off the
    // same blob it left it on, and the headline says so by name.
    const standing = context.players.find((player) => player.playerId === context.crown)
    const start = standing ?? pick(rng, context.players)
    // A little jiggle either way, so two goes at the same level are not twins.
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard) * range(rng, 0.9, 1.1))
    return {
      kind: 'keepTheCrown',
      id: context.id,
      headline: standing ? `Take the crown off ${standing.name}!` : 'Keep the crown!',
      remainingMs: totalMs,
      totalMs,
      zones: [],
      obstacles: [],
      marks: marksFor(start.playerId),
      carryables: [],
      outcome: 'running',
      note: null,
      wearer: start.playerId,
      crownMs: Math.round(scale(CROWN_TIME.easy, CROWN_TIME.hard, hard)),
      wornMs: {},
      graceMs: Math.round(scale(GRACE.easy, GRACE.hard, hard)),
      heldForMs: 0,
    }
  },

  /**
   * Judged against whoever is here *now*. A phone that is put down while its
   * blob is wearing the crown hands it straight back to the room rather than
   * standing in a corner running the clock down with it, and nobody is ever
   * chasing a blob that is not really there.
   */
  step(objective, state, dtMs) {
    const present = activePlayers(state)
    if (present.length === 0) return

    const wearer = present.find((player) => player.playerId === objective.wearer)
    if (!wearer) {
      crownTo(objective, pick(state.objectives.rng, present).playerId)
      return
    }

    objective.heldForMs += dtMs
    objective.wornMs[wearer.playerId] = wornBy(objective, wearer.playerId) + dtMs

    if (wornBy(objective, wearer.playerId) >= objective.crownMs) {
      win(objective, state, wearer)
      objective.note = `${wearer.name} kept the crown!`
      return
    }

    if (objective.heldForMs >= objective.graceMs) {
      const taker = nearestTouching(wearer, present)
      if (taker) crownTo(objective, taker.playerId)
    }

    // The buzzer is the end of it rather than a failure to finish in time, so
    // this says so itself before the director can call it a miss. Whoever wore
    // it longest keeps it, and keeps it into the next game and the one after.
    if (objective.remainingMs <= 0) {
      const longest = whoWoreItLongest(objective, present)
      if (longest) win(objective, state, longest)
      else objective.outcome = 'done'
      objective.note = longest ? `${longest.name} wore it longest!` : 'That crown never settled!'
    }
  },

  briefs(objective, state) {
    const wearer = activePlayers(state).find((player) => player.playerId === objective.wearer)
    // What the room is told: who to go for, and how to go for them. Driving
    // into somebody is the whole verb and it is worth spelling out, the way
    // fetch spells out driving into a parcel.
    const shared: Brief = {
      to: '*',
      headline: objective.headline,
      detail: wearer ? `${wearer.name} has it! Drive into them to take it.` : 'Nobody has it…',
      tone: 'task',
    }
    // The strip goes the colour of whoever is wearing it, so a child who
    // cannot read the name still sees it change hands.
    if (!wearer) return [shared]
    shared.colour = wearer.colour

    // And the private half, which is only ever a countdown: the one phone in
    // the room being chased is the one that wants to know how much longer.
    return [
      shared,
      {
        to: wearer.playerId,
        headline: objective.headline,
        detail: `Run! ${secondsToGo(objective, wearer.playerId)} more seconds and it is yours.`,
        colour: wearer.colour,
        tone: 'task',
      },
    ]
  },
}

/** Hand it over, and start the new wearer's few seconds of safety again. */
function crownTo(objective: KeepTheCrownObjective, playerId: string): void {
  objective.wearer = playerId
  objective.heldForMs = 0
  objective.marks = marksFor(playerId)
}

function marksFor(playerId: string): Mark[] {
  return [{ playerId, badge: CROWN_BADGE }]
}

/**
 * How long this blob has worn it in total. It is banked rather than reset when
 * the crown is taken, so having it stolen costs a child the crown and not the
 * minute they spent keeping it — and a phone that drops off and comes back
 * walks into the time it had.
 */
function wornBy(objective: KeepTheCrownObjective, playerId: string): number {
  return objective.wornMs[playerId] ?? 0
}

/** How much longer this blob has to keep it, counted down the way a child does. */
function secondsToGo(objective: KeepTheCrownObjective, playerId: string): number {
  return secondsLeft({ holdMs: objective.crownMs, heldMs: wornBy(objective, playerId) })
}

/**
 * Over, and the crown goes on this blob's head — not for the rest of the task,
 * which is finished, but for the rest of the evening. It is the one thing a
 * task leaves behind it.
 */
function win(objective: KeepTheCrownObjective, state: GameState, winner: Player): void {
  objective.outcome = 'done'
  state.objectives.crown = winner.playerId
  objective.marks = marksFor(winner.playerId)
}

/**
 * Who had it the longest of everybody still here, for the buzzer. Cheerful
 * either way, because the crown going round all game without settling is a
 * good game — and if nobody wore it at all, nobody wins it.
 */
function whoWoreItLongest(
  objective: KeepTheCrownObjective,
  present: readonly Player[],
): Player | null {
  let best: Player | null = null
  let longest = 0
  for (const player of present) {
    const worn = wornBy(objective, player.playerId)
    if (worn <= longest) continue
    longest = worn
    best = player
  }
  return best
}
