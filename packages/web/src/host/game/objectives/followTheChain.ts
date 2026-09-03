import { MAX_LEVEL } from '../constants.js'
import { intRange } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { blobsIn, type Zone } from '../zones.js'
import { hold, secondsLeft } from './hold.js'
import { makePads } from './pads.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Follow the lights. Pads sit dark on the floor and one of them lights up;
 * everybody has to be on the lit one before it goes out and the next lights
 * instead, and so on to the end of the chain.
 *
 * It is the most legible task in the list — a toddler who understands nothing
 * else understands "run to the bright one" — and it scales by simply making
 * the chain longer, which costs nothing.
 */

export interface FollowTheChainObjective extends ObjectiveBase {
  kind: 'followTheChain'
  /** The pads to visit, in order, by zone id. */
  chain: string[]
  /** How far along the chain they have got. */
  position: number
  holdMs: number
  heldMs: number
}

const ROOMINESS = { easy: 1.7, hard: 1.1 }
/** How long they have to all be on one before it counts. A pause, not a wait. */
const HOLD = { easy: 500, hard: 1_200 }
/** How many pads are on the floor, and how many lights the chain has. */
const PADS = { easy: 3, hard: 4 }
const LENGTH = { easy: 3, hard: 6 }
const TIME_LIMIT = { easy: 60_000, hard: 45_000 }

export const followTheChain: ObjectiveTemplate<FollowTheChainObjective> = {
  kind: 'followTheChain',
  /** One blob following lights around is a chore; a room doing it is a game. */
  minPlayers: 2,
  minLevel: 3,

  generate(context: GenerateContext): FollowTheChainObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const count = Math.round(scale(PADS.easy, PADS.hard, hard))
    const zones = makePads(
      context,
      count,
      Math.max(2, context.players.length),
      scale(ROOMINESS.easy, ROOMINESS.hard, hard),
    )
    const length = Math.round(scale(LENGTH.easy, LENGTH.hard, hard))
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))

    // Never the same pad twice running: a light that stays where it is reads
    // as a broken game rather than a lucky one.
    const chain: string[] = []
    while (chain.length < length) {
      const zone = zones[intRange(rng, 0, zones.length - 1)]
      if (!zone || zone.id === chain.at(-1)) continue
      chain.push(zone.id)
    }

    const objective: FollowTheChainObjective = {
      kind: 'followTheChain',
      id: context.id,
      headline: 'Follow the lights!',
      remainingMs: totalMs,
      totalMs,
      zones,
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      chain,
      position: 0,
      holdMs: Math.round(scale(HOLD.easy, HOLD.hard, hard)),
      heldMs: 0,
    }
    light(objective)
    return objective
  },

  step(objective, state, dtMs) {
    const present = activePlayers(state)
    const lit = litZone(objective)
    if (!lit || present.length === 0) return

    if (!hold(objective, blobsIn(lit, present).length === present.length, dtMs)) return

    // On to the next light, or that was the last of them.
    objective.position += 1
    objective.heldMs = 0
    if (objective.position >= objective.chain.length) {
      objective.outcome = 'done'
      return
    }
    light(objective)
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const lit = litZone(objective)
    const on = lit ? blobsIn(lit, present).length : 0
    const everybody = on === present.length && present.length > 0
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: everybody
        ? `Hold it… ${secondsLeft(objective)}`
        : `Light ${objective.position + 1} of ${objective.chain.length}: ${on} of ${present.length} on it`,
      tone: 'task',
    }
    // The strip is the colour of the pad they are being sent to, which is the
    // whole instruction for anybody who cannot read the rest of it.
    if (lit) brief.colour = lit.colour
    return [brief]
  },
}

/** Exactly one pad is bright; the rest sit dark and wait their turn. */
function light(objective: FollowTheChainObjective): void {
  const lit = objective.chain[objective.position]
  for (const zone of objective.zones) zone.dim = zone.id !== lit
}

function litZone(objective: FollowTheChainObjective): Zone | undefined {
  const lit = objective.chain[objective.position]
  return objective.zones.find((zone) => zone.id === lit)
}
