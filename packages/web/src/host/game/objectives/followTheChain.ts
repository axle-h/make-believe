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

/**
 * The whole room has to fit on the lit pad at once, so there is a great deal
 * more of it than there is on a pad two blobs share. A room of six on a pad
 * they cannot all stand inside is not a hard task, it is an impossible one.
 */
const ROOMINESS = { easy: 2.2, hard: 1.6 }
/** How long they have to all be on one before it counts. A pause, not a wait. */
const HOLD = { easy: 500, hard: 1_200 }
/**
 * How many pads are on the floor. It does not climb with the level: harder is
 * a longer chain and less elbow room, not more pads to squint at — and every
 * pad added is floor taken off all of them.
 */
const PADS = 3
const LENGTH = { easy: 2, hard: 4 }
/**
 * How long each light in the chain is worth. Per light rather than per task,
 * because a longer chain must not also be a tighter one — which is what it was
 * until the second play test, where the hardest version was six lights in less
 * time than three had been given.
 */
const PER_LIGHT = { easy: 20_000, hard: 14_000 }

export const followTheChain: ObjectiveTemplate<FollowTheChainObjective> = {
  kind: 'followTheChain',
  title: 'Follow the lights',
  /** One blob following lights around is a chore; a room doing it is a game. */
  minPlayers: 2,
  minLevel: 3,

  generate(context: GenerateContext): FollowTheChainObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    // Not `exactly`: if the room is too big for three pads this size, two
    // roomy pads are a game and three cramped ones are not. Two is the floor,
    // though — a chain with one pad has nowhere to send anybody.
    const zones = makePads(
      context,
      PADS,
      Math.max(2, context.players.length),
      scale(ROOMINESS.easy, ROOMINESS.hard, hard),
      { least: 2 },
    )
    const length = Math.round(scale(LENGTH.easy, LENGTH.hard, hard))
    const totalMs = Math.round(length * scale(PER_LIGHT.easy, PER_LIGHT.hard, hard))

    // Never the same pad twice running: a light that stays where it is reads
    // as a broken game rather than a lucky one.
    const chain: string[] = []
    while (chain.length < length) {
      const elsewhere = zones.filter((zone) => zone.id !== chain.at(-1))
      const zone = elsewhere[intRange(rng, 0, elsewhere.length - 1)]
      if (!zone) break
      chain.push(zone.id)
    }

    const objective: FollowTheChainObjective = {
      kind: 'followTheChain',
      id: context.id,
      headline: 'Follow the lights!',
      remainingMs: totalMs,
      totalMs,
      zones,
      obstacles: [],
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
