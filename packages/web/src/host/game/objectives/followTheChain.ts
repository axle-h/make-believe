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

/** Follow the lights: everybody present stands on the one lit pad, then the next lights, to the end of the chain. */

export interface FollowTheChainObjective extends ObjectiveBase {
  kind: 'followTheChain'
  /** Zone ids to visit, in order. */
  chain: string[]
  position: number
  holdMs: number
  heldMs: number
}

/** The whole room must fit on the lit pad at once, or the task is impossible. */
const ROOMINESS = { easy: 2.2, hard: 1.6 }
const HOLD = { easy: 500, hard: 1_200 }
/** Fixed at every level: harder is a longer chain and less elbow room, not more pads. */
const PADS = 3
const LENGTH = { easy: 2, hard: 4 }
/** Time per light rather than per task, so a longer chain is not also a tighter one. */
const PER_LIGHT = { easy: 20_000, hard: 14_000 }

export const followTheChain: ObjectiveTemplate<FollowTheChainObjective> = {
  kind: 'followTheChain',
  title: 'Follow the lights',
  minPlayers: 2,
  minLevel: 3,

  generate(context: GenerateContext): FollowTheChainObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    // Not `exactly`: two roomy pads beat three cramped ones, but one pad is no chain.
    const zones = makePads(
      context,
      PADS,
      Math.max(2, context.players.length),
      scale(ROOMINESS.easy, ROOMINESS.hard, hard),
      { least: 2 },
    )
    const length = Math.round(scale(LENGTH.easy, LENGTH.hard, hard))
    const totalMs = Math.round(length * scale(PER_LIGHT.easy, PER_LIGHT.hard, hard))

    // Never the same pad twice running: a light that stays put reads as broken.
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
    // The strip takes the lit pad's colour, the whole instruction for a child who cannot read.
    if (lit) brief.colour = lit.colour
    return [brief]
  },
}

function light(objective: FollowTheChainObjective): void {
  const lit = objective.chain[objective.position]
  for (const zone of objective.zones) zone.dim = zone.id !== lit
}

function litZone(objective: FollowTheChainObjective): Zone | undefined {
  const lit = objective.chain[objective.position]
  return objective.zones.find((zone) => zone.id === lit)
}
