import { MAX_LEVEL } from '../constants.js'
import { activePlayers } from '../selectors.js'
import type { Player } from '../state.js'
import { blobsIn, type Zone } from '../zones.js'
import { hold, secondsLeft } from './hold.js'
import { makePads } from './pads.js'
import {
  difficulty,
  scale,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * Two to a pad. One pad per couple appears and every pad wants exactly two
 * blobs on it — so the room has to sort itself out, out loud, before anybody
 * can stand still.
 *
 * It is cooperative by construction and it is the first task that cannot be
 * solved by everybody doing the same thing at once. The rule used to be
 * "nobody on their own", so that an odd room could always come out; a room of
 * five showed what that costs. Three on a pad counted, which made the rule
 * invisible — right until it wasn't — so the rule is now the one a child would
 * guess from the name, and the world only asks for it when a room can be
 * halved. That is what `suits` is for.
 */

export interface PairsObjective extends ObjectiveBase {
  kind: 'pairs'
  holdMs: number
  heldMs: number
}

/** Room for two and no more: a third blob shoving at the edge does not fit. */
const ROOMINESS = { easy: 1.2, hard: 0.95 }
const HOLD = { easy: 1_500, hard: 3_000 }
const TIME_LIMIT = { easy: 50_000, hard: 30_000 }

export const pairs: ObjectiveTemplate<PairsObjective> = {
  kind: 'pairs',
  title: 'Two to a pad',
  /** Two blobs and one pad is not a negotiation, and four is the next even room. */
  minPlayers: 4,
  minLevel: 3,

  /** Exactly two on every pad only comes out if the room can be halved. */
  suits(present) {
    return present % 2 === 0
  },

  generate(context: GenerateContext): PairsObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    // One pad per couple, exactly. There is no cap: a room of ten gets five,
    // because a capped count is a sum the room cannot make come out.
    const count = Math.max(1, Math.floor(context.players.length / 2))
    const zones = makePads(context, count, 2, scale(ROOMINESS.easy, ROOMINESS.hard, hard))
    // Dim until it has its two, so how far along the room is can be read off
    // the floor without anybody counting anything.
    for (const zone of zones) zone.dim = true
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'pairs',
      id: context.id,
      headline: 'Two to a pad!',
      remainingMs: totalMs,
      totalMs,
      zones,
      obstacles: [],
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

    for (const zone of objective.zones) zone.dim = blobsIn(zone, present).length !== 2

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
          : `${settled} of ${present.length} in a two. Two on every pad!`,
        tone: 'task',
      },
    ]
  },
}

/**
 * Everybody standing on a pad with exactly one other blob. With one pad per
 * couple that is the same sentence as "every pad has its two" — but it is
 * written from the blobs' end on purpose, because the room is judged against
 * whoever is here *now*: a couple who wander off mid-task leave a spare pad
 * behind, and a spare pad must not be a task the rest cannot finish.
 */
function everybodyPaired(zones: Zone[], present: Player[]): boolean {
  return paired(zones, present).length === present.length
}

/** The blobs standing on a pad that has exactly two on it. */
function paired(zones: Zone[], present: Player[]): Player[] {
  const together: Player[] = []
  for (const zone of zones) {
    const on = blobsIn(zone, present)
    if (on.length === 2) together.push(...on)
  }
  return together
}
