import { MAX_LEVEL } from '../constants.js'
import { activePlayers } from '../selectors.js'
import type { Player } from '../state.js'
import { blobsIn, type Zone } from '../zones.js'
import { hold, secondsLeft } from './hold.js'
import { makePads, MAX_NAMED_PADS } from './pads.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Two to a pad. Several pads appear and nobody may be standing on one alone —
 * so the room has to sort itself out, out loud, before anybody can stand still.
 *
 * It is cooperative by construction and it is the first task that cannot be
 * solved by everybody doing the same thing at once. The rule is deliberately
 * "nobody on their own" rather than "exactly two everywhere": a blob whose
 * phone has been put down, or a sixth child arriving halfway through, can
 * never leave the others with a sum that does not come out.
 */

export interface PairsObjective extends ObjectiveBase {
  kind: 'pairs'
  holdMs: number
  heldMs: number
}

/** Room for two, comfortably at first and a squash later. */
const ROOMINESS = { easy: 1.5, hard: 0.95 }
const HOLD = { easy: 1_500, hard: 3_000 }
const TIME_LIMIT = { easy: 50_000, hard: 30_000 }

export const pairs: ObjectiveTemplate<PairsObjective> = {
  kind: 'pairs',
  /** Two blobs and two pads is not a negotiation; three is. */
  minPlayers: 3,
  minLevel: 3,

  generate(context: GenerateContext): PairsObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    // One pad per couple, never fewer than two — a single pad is the spot they
    // have already been asked to stand on, and no choice at all.
    const count = Math.min(MAX_NAMED_PADS, Math.max(2, Math.floor(context.players.length / 2)))
    const zones = makePads(context, count, 2, scale(ROOMINESS.easy, ROOMINESS.hard, hard))
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'pairs',
      id: context.id,
      headline: 'Two to a pad!',
      remainingMs: totalMs,
      totalMs,
      zones,
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      holdMs: Math.round(scale(HOLD.easy, HOLD.hard, hard)),
      heldMs: 0,
    }
  },

  step(objective, state, dtMs) {
    const present = activePlayers(state)
    if (present.length === 0) return

    if (hold(objective, everybodyPaired(objective.zones, present), dtMs)) objective.outcome = 'done'
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    const settled = paired(objective.zones, present).length
    const done = settled === present.length && present.length > 0
    return [
      {
        to: '*',
        headline: objective.headline,
        detail: done
          ? `Hold it… ${secondsLeft(objective)}`
          : `${settled} of ${present.length} paired up. Nobody on their own!`,
        tone: 'task',
      },
    ]
  },
}

/** Everybody on a pad, and nobody the only one on theirs. */
function everybodyPaired(zones: Zone[], present: Player[]): boolean {
  return paired(zones, present).length === present.length
}

/** The blobs standing on a pad with somebody else. */
function paired(zones: Zone[], present: Player[]): Player[] {
  const together: Player[] = []
  for (const zone of zones) {
    const on = blobsIn(zone, present)
    if (on.length >= 2) together.push(...on)
  }
  return together
}
