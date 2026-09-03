import { MAX_LEVEL, PALETTE } from '../constants.js'
import { distance, toRgb } from '../colour.js'
import { activePlayers } from '../selectors.js'
import type { GameState, Player } from '../state.js'
import { contains, type Zone } from '../zones.js'
import { hold, secondsLeft } from './hold.js'
import { makePads, nameOfColour } from './pads.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Find your colour. A pad for every colour of blob in the room, each one
 * painted that colour — so the answer to "where do I go?" is on the floor,
 * where a three-year-old who cannot read a word of the brief can see it.
 *
 * The pad **is** the blob, which is the whole idea: no other task in the list
 * can be understood without either a word or a demonstration. Two children who
 * happen to be wearing the same colour share a pad and have to squeeze.
 *
 * Each phone is still told its own pad in words as well, for whoever wants
 * telling. Higher up the ladder it is told **somebody else's** instead — which
 * with coloured pads is not a secret so much as an errand: go and tell Ted.
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
  title: 'Find your own pad',
  /** Being told where you go only means anything if somebody else is told something different. */
  minPlayers: 2,
  minLevel: 4,

  generate(context: GenerateContext): FindYourColourObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    // One pad per colour of blob in the room, in palette order so the floor
    // does not reshuffle itself between one go and the next. Two of the same
    // colour get one pad between them, which is a squeeze rather than a bug.
    const colours = coloursPresent(context.players)
    // One pad per colour, exactly: a pad traded away for room would be a
    // child sent to look for a pad that is not on the floor.
    const zones = makePads(
      context,
      colours.length,
      sharing(context.players, colours),
      scale(ROOMINESS.easy, ROOMINESS.hard, hard),
      { colours, exactly: true },
    )
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))

    const objective: FindYourColourObjective = {
      kind: 'findYourColour',
      id: context.id,
      headline: 'Find your own pad!',
      remainingMs: totalMs,
      totalMs,
      zones,
      obstacles: [],
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

/**
 * Which colours are in the room, in palette order and each one once. Two blobs
 * the same colour count for one pad, which is what puts them on it together.
 */
function coloursPresent(players: Player[]): string[] {
  const worn = new Set(players.map((player) => player.colour))
  const known = PALETTE.filter((colour) => worn.has(colour))
  // A colour off the palette should not be possible, but a pad nobody can
  // stand on would be, so anything unexpected still gets one.
  const strays = [...worn].filter((colour) => !PALETTE.includes(colour))
  return [...known, ...strays]
}

/** How many blobs the busiest pad has to hold, which is what sizes them all. */
function sharing(players: Player[], colours: string[]): number {
  let most = 1
  for (const colour of colours) {
    most = Math.max(most, players.filter((player) => player.colour === colour).length)
  }
  return most
}

/**
 * Everybody present is on the pad their own colour, and nobody who has gone
 * still holds one.
 *
 * A blob that joins after the pads were laid out may be wearing a colour none
 * of them is. Rather than leave it with nowhere to go, it shares the pad
 * nearest its own colour — which is a rule that can be said out loud ("go on
 * the closest one to you") and is far better than a blob standing about.
 */
function settle(objective: FindYourColourObjective, present: Player[]): void {
  const here = new Set(present.map((player) => player.playerId))
  for (const playerId of Object.keys(objective.homes)) {
    if (here.has(playerId)) continue
    delete objective.homes[playerId]
    delete objective.tells[playerId]
  }

  for (const player of present) {
    objective.homes[player.playerId] = padForColour(objective, player.colour)
    // A phone that has only just arrived is told about itself, whatever the
    // rest of the room was told: it has nobody to have heard it from.
    objective.tells[player.playerId] ??= player.playerId
    // The blob it was told about has gone. It gets told about itself instead,
    // rather than being left with an errand there is nobody left to run.
    const about = objective.tells[player.playerId]
    if (about === undefined || !here.has(about)) objective.tells[player.playerId] = player.playerId
  }
}

/** The pad of this colour, or failing that the one that looks most like it. */
function padForColour(objective: FindYourColourObjective, colour: string): string {
  const exact = objective.zones.find((zone) => zone.colour === colour)
  if (exact) return exact.id

  const wanted = toRgb(colour)
  let nearest = objective.zones[0]
  let shortest = Number.POSITIVE_INFINITY
  for (const zone of objective.zones) {
    const gap = distance(wanted, toRgb(zone.colour))
    if (gap >= shortest) continue
    shortest = gap
    nearest = zone
  }
  return nearest?.id ?? ''
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
