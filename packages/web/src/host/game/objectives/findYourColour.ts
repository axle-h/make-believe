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
 * Find your colour: one pad per colour present, painted that colour, so the answer is on the
 * floor for a child who cannot read. Blobs sharing a colour share a pad.
 * From `SWAP_FROM_LEVEL` each phone is told somebody else's pad instead, so the room has to talk.
 */

export interface FindYourColourObjective extends ObjectiveBase {
  kind: 'findYourColour'
  /** Pad id each blob belongs on, by playerId. */
  homes: Record<string, string>
  /** Whose pad each phone is told about, by playerId. */
  tells: Record<string, string>
  holdMs: number
  heldMs: number
}

const ROOMINESS = { easy: 1.6, hard: 1 }
const HOLD = { easy: 1_200, hard: 2_500 }
const TIME_LIMIT = { easy: 55_000, hard: 35_000 }

const SWAP_FROM_LEVEL = 6

export const findYourColour: ObjectiveTemplate<FindYourColourObjective> = {
  kind: 'findYourColour',
  title: 'Find your own pad',
  minPlayers: 2,
  minLevel: 4,

  generate(context: GenerateContext): FindYourColourObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const colours = coloursPresent(context.players)
    // `exactly`: a pad dropped for lack of room would send a child looking for a pad that is not there.
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

  /** Judged against whoever is present: late arrivals get a pad, and leavers drop out of the sum. */
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

/** Colours present, each once and in palette order so the floor does not reshuffle between goes. */
function coloursPresent(players: Player[]): string[] {
  const worn = new Set(players.map((player) => player.colour))
  const known = PALETTE.filter((colour) => worn.has(colour))
  // A colour off the palette still gets a pad, so no blob is left with nowhere to go.
  const strays = [...worn].filter((colour) => !PALETTE.includes(colour))
  return [...known, ...strays]
}

/** How many blobs the busiest pad has to hold, which sizes them all. */
function sharing(players: Player[], colours: string[]): number {
  let most = 1
  for (const colour of colours) {
    most = Math.max(most, players.filter((player) => player.colour === colour).length)
  }
  return most
}

/** Give every present blob a pad and forget the absent. A colour with no pad takes the nearest one. */
function settle(objective: FindYourColourObjective, present: Player[]): void {
  const here = new Set(present.map((player) => player.playerId))
  for (const playerId of Object.keys(objective.homes)) {
    if (here.has(playerId)) continue
    delete objective.homes[playerId]
    delete objective.tells[playerId]
  }

  for (const player of present) {
    objective.homes[player.playerId] = padForColour(objective, player.colour)
    // A newcomer, or a phone whose errand has left, is told about itself.
    objective.tells[player.playerId] ??= player.playerId
    const about = objective.tells[player.playerId]
    if (about === undefined || !here.has(about)) objective.tells[player.playerId] = player.playerId
  }
}

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

/** Tell each phone the next blob's pad, in a ring, so nobody is told about themselves and nobody is left out. */
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
