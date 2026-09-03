import { MAX_LEVEL } from '../constants.js'
import { activePlayers } from '../selectors.js'
import type { GameState, Player } from '../state.js'
import { contains, type Zone } from '../zones.js'
import { hold, secondsLeft } from './hold.js'
import { makePads, nameOfColour, MAX_NAMED_PADS } from './pads.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Find your colour. The same pads as pairs, except that the floor says nothing
 * about who belongs where: each phone is told privately, and that is the only
 * place it is written down.
 *
 * This is the first task that spends the phone as a channel of its own, and it
 * is spent carefully — the pads are still plainly there on the TV, so a child
 * who cannot read is looking at four coloured spots and being told a colour by
 * whoever is next to them. Being told is a normal part of it, not a failure.
 *
 * Higher up the ladder it tells each phone **somebody else's** pad instead, so
 * the only way anybody learns where they go is if the room says it out loud.
 * The Say box starts doing real work, and nothing about the task requires it:
 * a room that solves it by shouting across the sofa has solved it properly.
 */

export interface FindYourColourObjective extends ObjectiveBase {
  kind: 'findYourColour'
  /** Which pad each blob belongs on, by playerId. */
  homes: Record<string, string>
  /**
   * Whose home each phone is told about. Its own, usually; somebody else's
   * once the world is being difficult, which is what makes them talk.
   */
  tells: Record<string, string>
  holdMs: number
  heldMs: number
}

const ROOMINESS = { easy: 1.6, hard: 1 }
const HOLD = { easy: 1_200, hard: 2_500 }
const TIME_LIMIT = { easy: 55_000, hard: 35_000 }

/** Above this, a phone is told where somebody *else* goes. */
const SWAP_FROM_LEVEL = 6

export const findYourColour: ObjectiveTemplate<FindYourColourObjective> = {
  kind: 'findYourColour',
  /** Being told where you go only means anything if somebody else is told something different. */
  minPlayers: 2,
  minLevel: 4,

  generate(context: GenerateContext): FindYourColourObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    // Never more pads than there are colours with names: the whole task is
    // that a phone can say which one is yours in one word.
    const count = Math.min(MAX_NAMED_PADS, Math.max(2, context.players.length))
    const zones = makePads(
      context,
      count,
      padCapacity(context.players.length, count),
      scale(ROOMINESS.easy, ROOMINESS.hard, hard),
    )
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))

    const objective: FindYourColourObjective = {
      kind: 'findYourColour',
      id: context.id,
      headline: 'Find your own pad!',
      remainingMs: totalMs,
      totalMs,
      zones,
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      homes: {},
      tells: {},
      holdMs: Math.round(scale(HOLD.easy, HOLD.hard, hard)),
      heldMs: 0,
    }
    settle(objective, context.players)
    if (context.level >= SWAP_FROM_LEVEL) {
      objective.headline = 'Tell them where they go!'
      shuffleTells(objective, context.players)
    }
    return objective
  },

  /**
   * Judged against whoever is here now. A blob that arrives halfway through is
   * given a pad of its own on the spot and told about it, and one that leaves
   * takes its pad out of the sum — nobody is ever standing on their spot
   * waiting for a child who has wandered off to the kitchen.
   */
  step(objective, state, dtMs) {
    const present = activePlayers(state)
    if (present.length === 0) return
    settle(objective, present)

    if (hold(objective, present.every((player) => atHome(objective, player)), dtMs)) {
      objective.outcome = 'done'
    }
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const home = present.filter((player) => atHome(objective, player)).length
    const everybody = home === present.length && present.length > 0

    const briefs: Brief[] = [
      {
        to: '*',
        headline: objective.headline,
        detail: everybody
          ? `Hold it… ${secondsLeft(objective)}`
          : `${home} of ${present.length} home`,
        tone: 'task',
      },
    ]

    // The private half: one line each, and the only place the answer exists.
    for (const player of present) {
      const about = objective.tells[player.playerId]
      if (about === undefined) continue
      const pad = padOf(objective, about)
      if (!pad) continue
      const colour = nameOfColour(pad.colour)
      const mine = about === player.playerId
      briefs.push({
        to: player.playerId,
        headline: objective.headline,
        detail: mine
          ? `Yours is the ${colour} pad`
          : `${nameOf(state, about)} goes on the ${colour} pad, so tell them!`,
        colour: pad.colour,
        tone: 'task',
      })
    }
    return briefs
  },
}

/** How many blobs share a pad when there are more blobs than colours. */
function padCapacity(players: number, pads: number): number {
  return Math.max(1, Math.ceil(players / Math.max(1, pads)))
}

/**
 * Everybody present has a pad, and nobody who has gone still holds one. Pads
 * are handed out to the emptiest one going, so a room bigger than the palette
 * splits evenly rather than piling onto the white one.
 */
function settle(objective: FindYourColourObjective, present: Player[]): void {
  const here = new Set(present.map((player) => player.playerId))
  for (const playerId of Object.keys(objective.homes)) {
    if (here.has(playerId)) continue
    delete objective.homes[playerId]
    delete objective.tells[playerId]
  }

  for (const player of present) {
    if (objective.homes[player.playerId] === undefined) {
      objective.homes[player.playerId] = emptiestPad(objective)
      // A phone that has only just arrived is told about itself, whatever the
      // rest of the room was told: it has nobody to have heard it from.
      objective.tells[player.playerId] = player.playerId
    }
    // The blob it was told about has gone, taking the only copy of this
    // phone's own pad with it. It gets told about itself instead, rather than
    // being left with a task nobody in the room can answer.
    const about = objective.tells[player.playerId]
    if (about === undefined || !here.has(about)) objective.tells[player.playerId] = player.playerId
  }
}

function emptiestPad(objective: FindYourColourObjective): string {
  const taken = Object.values(objective.homes)
  let best = objective.zones[0]?.id ?? ''
  let fewest = Number.POSITIVE_INFINITY
  for (const zone of objective.zones) {
    const on = taken.filter((id) => id === zone.id).length
    if (on >= fewest) continue
    fewest = on
    best = zone.id
  }
  return best
}

/**
 * Pass every phone the next blob's pad rather than its own, in one ring. It is
 * a ring rather than a shuffle so that nobody is told about themselves and
 * everybody is told about by somebody — the room can always solve it, provided
 * they talk.
 */
function shuffleTells(objective: FindYourColourObjective, players: Player[]): void {
  if (players.length < 2) return
  for (const [index, player] of players.entries()) {
    const next = players[(index + 1) % players.length]
    if (next) objective.tells[player.playerId] = next.playerId
  }
}

function atHome(objective: FindYourColourObjective, player: Player): boolean {
  const pad = padOf(objective, player.playerId)
  return pad !== undefined && contains(pad, player.x, player.y)
}

function padOf(objective: FindYourColourObjective, playerId: string): Zone | undefined {
  const home = objective.homes[playerId]
  return objective.zones.find((zone) => zone.id === home)
}

function nameOf(state: GameState, playerId: string): string {
  return state.players.get(playerId)?.name ?? 'Somebody'
}
