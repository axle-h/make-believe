import { BLOB_SIZE, MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import type { Obstacle } from '../obstacles.js'
import { intRange, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState, Player } from '../state.js'
import { blobsIn, type RectZone } from '../zones.js'
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
 * The race. A wide start pad down the left, a finish pad down the right, and
 * something in the way. Everybody gathers on the start, then 3 — 2 — 1 — GO.
 *
 * **"No false starts" is not a rule.** It sounds like one — hold six joysticks
 * still for three seconds — and rule one says drive is live in every task, for
 * everybody, throughout. So there is no rule at all: the start pad has a
 * **gate** across its mouth, and the gate is taken away on GO. Every joystick
 * works the whole time, a blob shoving at the gate is a blob doing exactly
 * what it should, and nobody can jump the gun because there is a wall there.
 * The floor explains it, which is how find-your-own-pad and the two-sized pad
 * work too.
 *
 * **It is done when everybody present is home**, not when the first one is.
 * That is what keeps a race inside the rules: the room is racing the course,
 * there is a winner in it, and the last child home still finishes rather than
 * being stopped.
 */

export interface RaceObjective extends ObjectiveBase {
  kind: 'race'
  /** Gathering on the start line, counting down, or off. */
  phase: 'gathering' | 'counting' | 'racing'
  /** How long the room has been gathering, for the patience below. */
  gatheredMs: number
  /** What is left of the countdown. */
  countdownMs: number
  /** The last whole second counted out, so it is said once. */
  counted: number | null
  /** Who got there first, by name, once anybody has. */
  firstHome: string | null
  /** Everybody who has finished, by `playerId`. */
  home: string[]
}

/** Worn beside the name of everybody who is home. */
const HOME_BADGE = '🏁'

/**
 * How long the world waits for a room to gather before it counts down anyway.
 *
 * "No time limit" means no pressure, not an evening that can stall. A child
 * who has put the phone down is already excluded — `activePlayers` does that —
 * but one who is present and dawdling must not be able to hold the room.
 */
const PATIENCE_MS = 20_000
/** Three, two, one, go: one second each. */
const COUNTDOWN_MS = 4_000
/** How long the race itself gets, once it has started. */
const TIME_LIMIT = { easy: 45_000, hard: 35_000 }
/** How many things are in the way. */
const BLOCKS = { easy: 2, hard: 4 }
/** How wide a block is, and how much of the floor's height it takes. */
const BLOCK_WIDTH = 34
const BLOCK_SHARE = { easy: 0.42, hard: 0.58 }

export const race: ObjectiveTemplate<RaceObjective> = {
  kind: 'race',
  title: 'The race',
  /** One blob racing itself is a stopwatch. */
  minPlayers: 2,
  /**
   * Low on the ladder: it needs no reading at all, only legs. Not the *first*
   * rung, though — that one is deliberately a room learning one thing, and a
   * new room has enough to work out without a starting gate as well.
   */
  minLevel: 3,

  generate(context: GenerateContext): RaceObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { world } = context
    // Tall pads down each edge, but not the whole height: a wall as tall as
    // the floor is a wall that shuts the floor in half, and the way round one
    // is never worth taking — leaving the start pad stops the countdown.
    const tall = world.height - BLOB_SIZE * 3
    const wide = BLOB_SIZE * 2.2
    const start: RectZone = {
      id: `${context.id}-start`,
      shape: 'rect',
      x: wide / 2 + BLOB_SIZE / 2,
      y: world.height / 2,
      width: wide,
      height: tall,
      colour: ZONE_COLOURS[2]?.hex ?? '#ffe08a',
      label: 'START',
    }
    const finish: RectZone = {
      ...start,
      id: `${context.id}-finish`,
      x: world.width - wide / 2 - BLOB_SIZE / 2,
      colour: ZONE_COLOURS[3]?.hex ?? '#b9ffb0',
      label: 'FINISH',
    }

    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'race',
      id: context.id,
      headline: 'To the start line!',
      remainingMs: totalMs,
      totalMs,
      // No clock at all while they gather: a countdown running while people
      // arrive is a countdown that punishes whoever was slowest.
      clock: 'held',
      zones: [start, finish],
      obstacles: [gate(context.id, start), ...course(context, hard, start, finish)],
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      phase: 'gathering',
      gatheredMs: 0,
      countdownMs: COUNTDOWN_MS,
      counted: null,
      firstHome: null,
      home: [],
    }
  },

  step(objective, state, dtMs) {
    const present = activePlayers(state)
    if (present.length === 0) return
    if (objective.phase === 'gathering') return gather(objective, present, dtMs)
    if (objective.phase === 'counting') return countIn(objective, state, dtMs)

    const finish = objective.zones[1]
    if (!finish) return
    for (const player of blobsIn(finish, present)) {
      if (objective.home.includes(player.playerId)) continue
      objective.home.push(player.playerId)
      objective.firstHome ??= player.name
      objective.marks = objective.home.map((playerId): Mark => ({ playerId, badge: HOME_BADGE }))
    }
    // Everybody who is here, not merely the first: the room is racing the
    // course, and the last one home still finishes.
    if (present.every((player) => objective.home.includes(player.playerId))) {
      objective.outcome = 'done'
      objective.note = objective.firstHome
        ? `${objective.firstHome} got there first!`
        : 'Everybody home!'
    }
  },

  briefs(objective, state) {
    const present = activePlayers(state)
    if (objective.phase === 'counting') {
      const seconds = counting(objective)
      return [
        {
          to: '*',
          headline: seconds > 0 ? String(seconds) : 'GO!',
          detail: seconds > 0 ? 'Get ready…' : 'Race!',
          tone: 'task',
        },
      ]
    }
    if (objective.phase === 'gathering') {
      const start = objective.zones[0]
      const ready = start ? blobsIn(start, present).length : 0
      const brief: Brief = {
        to: '*',
        headline: objective.headline,
        detail: `${ready} of ${present.length} on the start line`,
        tone: 'task',
      }
      if (start) brief.colour = start.colour
      return [brief]
    }
    const brief: Brief = {
      to: '*',
      headline: 'Race to the other side!',
      detail: objective.firstHome
        ? `${objective.firstHome} got there first! ${objective.home.length} of ${present.length} home`
        : `${objective.home.length} of ${present.length} home`,
      tone: 'task',
    }
    const finish = objective.zones[1]
    if (finish) brief.colour = finish.colour
    return [brief]
  },
}

/** Waiting for the room, with no clock and nothing taken away from anybody. */
function gather(objective: RaceObjective, present: Player[], dtMs: number): void {
  objective.gatheredMs += dtMs
  const start = objective.zones[0]
  const everybody = start !== undefined && blobsIn(start, present).length === present.length
  if (!everybody && objective.gatheredMs < PATIENCE_MS) return
  objective.phase = 'counting'
  objective.countdownMs = COUNTDOWN_MS
}

/** Three, two, one — and the gate goes. */
function countIn(objective: RaceObjective, state: GameState, dtMs: number): void {
  objective.countdownMs -= dtMs
  const seconds = counting(objective)
  if (objective.counted !== seconds) {
    objective.counted = seconds
    state.objectives.sounds.push({ to: '*', cue: seconds > 0 ? 'count' : 'go' })
  }
  if (objective.countdownMs > 0) return

  objective.phase = 'racing'
  objective.clock = 'running'
  // The gate, and only the gate: everything else in the way stays there.
  objective.obstacles = objective.obstacles.filter((wall) => !wall.id.endsWith('-gate'))
}

/**
 * The number to say out loud, with 0 meaning GO. The last second of the
 * countdown is GO's own, so three, two, one and go each get one.
 */
function counting(objective: RaceObjective): number {
  return Math.max(0, Math.ceil((objective.countdownMs - 1_000) / 1_000))
}

/**
 * The gate across the mouth of the start pad. It is what makes "no false
 * starts" a thing on the floor rather than a rule about joysticks.
 */
function gate(id: string, start: RectZone): Obstacle {
  return {
    id: `${id}-gate`,
    x: start.x + start.width / 2,
    y: start.y,
    width: BLOCK_WIDTH,
    height: start.height,
  }
}

/**
 * Something in the way: a few bars, each covering about half the floor's
 * height, alternately hung from the top and the bottom. Whatever else they
 * are, there is always a gap the other way round — a course a blob cannot get
 * through is a race nobody finishes.
 */
function course(
  context: GenerateContext,
  hard: number,
  start: RectZone,
  finish: RectZone,
): Obstacle[] {
  const { rng, world } = context
  const count = Math.round(scale(BLOCKS.easy, BLOCKS.hard, hard))
  const share = scale(BLOCK_SHARE.easy, BLOCK_SHARE.hard, hard)
  const height = world.height * share
  const from = start.x + start.width / 2 + BLOB_SIZE * 1.5
  const to = finish.x - finish.width / 2 - BLOB_SIZE * 1.5
  const lane = (to - from) / count

  return Array.from({ length: count }, (_, index): Obstacle => {
    const middle = from + lane * (index + 0.5)
    // Hung from the top or from the bottom, alternately, with a jiggle so two
    // goes at the same level are not twins.
    const top = (index + intRange(rng, 0, 1)) % 2 === 0
    return {
      id: `${context.id}-block-${index}`,
      x: middle + range(rng, -lane * 0.15, lane * 0.15),
      y: top ? height / 2 : world.height - height / 2,
      width: BLOCK_WIDTH,
      height,
    }
  })
}
