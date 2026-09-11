import { nearestTouching } from '../collisions.js'
import { walls } from './arena.js'
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
 * Keep the crown: wearing it is what counts, and driving into the wearer takes it.
 * The crown is a mark, not a carryable, so it moves exactly as fast as its wearer.
 * Whoever wins it keeps wearing it into later tasks until somebody takes it off them.
 */

export interface KeepTheCrownObjective extends ObjectiveBase {
  kind: 'keepTheCrown'
  /** Whoever is wearing it, or `null` for the instant before anybody is. */
  wearer: string | null
  /** How long it has to be worn, all told, to win it outright. */
  crownMs: number
  wornMs: Record<string, number>
  /** How long a fresh crown stays put before a touch can take it. */
  graceMs: number
  /** Time since the crown last changed hands. */
  heldForMs: number
}

const CROWN_TIME = { easy: 7_000, hard: 11_000 }
/** How long you are safe for after taking it. Long enough to get away. */
const GRACE = { easy: 1_200, hard: 700 }
/** How long the whole thing lasts if nobody manages to keep it that long. */
const TIME_LIMIT = { easy: 40_000, hard: 34_000 }

export const keepTheCrown: ObjectiveTemplate<KeepTheCrownObjective> = {
  kind: 'keepTheCrown',
  title: 'Keep the crown',
  minPlayers: 2,
  minLevel: MAX_LEVEL,

  generate(context: GenerateContext): KeepTheCrownObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    // The standing crown-holder starts with it, and the headline names them.
    const standing = context.players.find((player) => player.playerId === context.crown)
    const start = standing ?? pick(rng, context.players)
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard) * range(rng, 0.9, 1.1))
    return {
      kind: 'keepTheCrown',
      id: context.id,
      headline: standing ? `Take the crown off ${standing.name}!` : 'Keep the crown!',
      remainingMs: totalMs,
      totalMs,
      zones: [],
      obstacles: walls(context, hard),
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

  /** Judged against whoever is present: an away wearer's crown goes to somebody who is here. */
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

    // The buzzer ends it as done, before the director can call it a miss: whoever wore it longest wins it.
    if (objective.remainingMs <= 0) {
      const longest = whoWoreItLongest(objective, present)
      if (longest) win(objective, state, longest)
      else objective.outcome = 'done'
      objective.note = longest ? `${longest.name} wore it longest!` : 'That crown never settled!'
    }
  },

  briefs(objective, state) {
    const wearer = activePlayers(state).find((player) => player.playerId === objective.wearer)
    const shared: Brief = {
      to: '*',
      headline: objective.headline,
      detail: wearer ? `${wearer.name} has it! Drive into them to take it.` : 'Nobody has it…',
      tone: 'task',
    }
    // The strip takes the wearer's colour, so a child who cannot read sees it change hands.
    if (!wearer) return [shared]
    shared.colour = wearer.colour

    // The wearer's phone alone gets the countdown.
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

/** Hand it over, and restart the new wearer's grace period. */
function crownTo(objective: KeepTheCrownObjective, playerId: string): void {
  objective.wearer = playerId
  objective.heldForMs = 0
  objective.marks = marksFor(playerId)
}

function marksFor(playerId: string): Mark[] {
  return [{ playerId, badge: CROWN_BADGE }]
}

/** Time worn is banked, not reset, so losing the crown never loses the time already worn. */
function wornBy(objective: KeepTheCrownObjective, playerId: string): number {
  return objective.wornMs[playerId] ?? 0
}

function secondsToGo(objective: KeepTheCrownObjective, playerId: string): number {
  return secondsLeft({ holdMs: objective.crownMs, heldMs: wornBy(objective, playerId) })
}

/** The crown is kept in `state.objectives.crown`, the one thing a task leaves behind it. */
function win(objective: KeepTheCrownObjective, state: GameState, winner: Player): void {
  objective.outcome = 'done'
  state.objectives.crown = winner.playerId
  objective.marks = marksFor(winner.playerId)
}

/** Whoever present wore it longest, or `null` if nobody wore it at all. */
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
