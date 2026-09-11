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

/** Two to a pad: one pad per couple, and every pad wants exactly two blobs on it. */

export interface PairsObjective extends ObjectiveBase {
  kind: 'pairs'
  holdMs: number
  heldMs: number
}

/** Room for two and no more. */
const ROOMINESS = { easy: 1.2, hard: 0.95 }
const HOLD = { easy: 1_500, hard: 3_000 }
const TIME_LIMIT = { easy: 50_000, hard: 30_000 }

export const pairs: ObjectiveTemplate<PairsObjective> = {
  kind: 'pairs',
  title: 'Two to a pad',
  minPlayers: 4,
  minLevel: 3,

  /** Exactly two on every pad only comes out in an even room. */
  suits(present) {
    return present % 2 === 0
  },

  generate(context: GenerateContext): PairsObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    // One pad per couple, `exactly` and uncapped, or the sum cannot come out.
    const count = Math.max(1, Math.floor(context.players.length / 2))
    const zones = makePads(context, count, 2, scale(ROOMINESS.easy, ROOMINESS.hard, hard), {
      exactly: true,
    })
    // Dim until it has its two, so progress can be read off the floor.
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

/** Judged from the blobs' end, against whoever is present, so a pad left spare by leavers is not needed. */
function everybodyPaired(zones: Zone[], present: Player[]): boolean {
  return paired(zones, present).length === present.length
}

function paired(zones: Zone[], present: Player[]): Player[] {
  const together: Player[] = []
  for (const zone of zones) {
    const on = blobsIn(zone, present)
    if (on.length === 2) together.push(...on)
  }
  return together
}
