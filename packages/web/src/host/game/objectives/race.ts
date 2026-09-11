import { BLOB_SIZE, MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import { carveMaze } from '../mazes.js'
import type { Obstacle } from '../obstacles.js'
import { intRange, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState, Player, World } from '../state.js'
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

// No false starts is a gate across the start pad, taken away on GO, never a joystick ignored.

export interface RaceObjective extends ObjectiveBase {
  kind: 'race'
  phase: 'gathering' | 'counting' | 'racing'
  gatheredMs: number
  countdownMs: number
  /** The last whole second counted out, so it is said once. */
  counted: number | null
  /** A name, not a `playerId`. */
  firstHome: string | null
  home: string[]
}

export const HOME_BADGE = '🏁'

/** A room that is present but dawdling counts down anyway after this, so nobody can stall it. */
const PATIENCE_MS = 20_000
/** Three, two, one, go: one second each. */
const COUNTDOWN_MS = 4_000
/** Grows with the level rather than tightening, because the course does. */
const TIME_LIMIT = { easy: 45_000, hard: 50_000 }
const BLOCKS = { easy: 2, hard: 4 }
const BLOCK_WIDTH = 34
const BLOCK_SHARE = { easy: 0.42, hard: 0.58 }
/** Bars, then bobbing bars, then a turning bar, then a maze. */
const BOBBING_FROM = 0.4
const SPINNING_FROM = 0.65
const MAZE_FROM = 0.85
const BOB_REACH = 110
const BOB_PERIOD_MS = 3_600
const SPIN_LENGTH = 420
const SPIN_SPEED = { easy: 0.5, hard: 0.9 }

export const race: ObjectiveTemplate<RaceObjective> = {
  kind: 'race',
  title: 'The race',
  minPlayers: 2,
  minLevel: 3,

  generate(context: GenerateContext): RaceObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { world } = context
    // Short of the full height, so a blob can get round the end of a pad.
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
      // No clock while they gather, or it punishes whoever was slowest to arrive.
      clock: 'held',
      zones: [start, finish],
      // The course is down from the start; the gate goes up only once the room is gathered.
      obstacles: course(context, hard, start, finish),
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
    if (objective.phase === 'gathering') return gather(objective, present, state.world, dtMs)
    if (objective.phase === 'counting') return countIn(objective, state, dtMs)

    const finish = objective.zones[1]
    if (!finish) return
    for (const player of blobsIn(finish, present)) {
      if (objective.home.includes(player.playerId)) continue
      objective.home.push(player.playerId)
      objective.firstHome ??= player.name
      objective.marks = objective.home.map((playerId): Mark => ({ playerId, badge: HOME_BADGE }))
    }
    // Done when everybody present is home, not the first: the last child still finishes.
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

/** The gate goes up when the room is gathered, or patience runs out; a dawdler starts from where it stood. */
function gather(
  objective: RaceObjective,
  present: Player[],
  world: World,
  dtMs: number,
): void {
  objective.gatheredMs += dtMs
  const start = objective.zones[0]
  const everybody = start !== undefined && blobsIn(start, present).length === present.length
  if (!everybody && objective.gatheredMs < PATIENCE_MS) return
  objective.phase = 'counting'
  objective.countdownMs = COUNTDOWN_MS
  if (start?.shape === 'rect') {
    objective.obstacles = [gate(objective.id, start, world), ...objective.obstacles]
  }
}

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
  // Taken down on GO; the rest of the course stays.
  objective.obstacles = objective.obstacles.filter((wall) => !wall.id.endsWith('-gate'))
}

/** 0 is GO, which gets the last second of the countdown to itself. */
function counting(objective: RaceObjective): number {
  return Math.max(0, Math.ceil((objective.countdownMs - 1_000) / 1_000))
}

/**
 * Spans the whole floor top to bottom: the pad is shorter than the floor, and a gate with a lane over
 * it is not a gate. Centred on the pad's right edge so `pushOutOfObstacles` slides blobs back onto the
 * pad. The only wall allowed to cut the floor in half, because it lasts four seconds.
 */
function gate(id: string, start: RectZone, world: World): Obstacle {
  return {
    id: `${id}-gate`,
    x: start.x + start.width / 2,
    y: world.height / 2,
    width: BLOCK_WIDTH,
    height: world.height,
  }
}

/** Every rung leaves a way through: a bar leaves a lane the other side, and a maze connects every cell. */
function course(
  context: GenerateContext,
  hard: number,
  start: RectZone,
  finish: RectZone,
): Obstacle[] {
  const { rng, world } = context
  const from = start.x + start.width / 2 + BLOB_SIZE * 1.5
  const to = finish.x - finish.width / 2 - BLOB_SIZE * 1.5
  const share = scale(BLOCK_SHARE.easy, BLOCK_SHARE.hard, hard)
  const height = world.height * share

  if (hard >= MAZE_FROM) {
    return carveMaze(context.id, rng, {
      x: from,
      y: 0,
      width: to - from,
      height: world.height,
    })
  }

  if (hard >= SPINNING_FROM) {
    // The turner has the middle to itself: two things that can reach each other could pin a blob.
    return [
      bar(context, 0, from, height, true, true),
      spinner(context, (from + to) / 2, world.height / 2, hard),
      bar(context, 1, to, height, false, true),
    ]
  }

  const count = Math.round(scale(BLOCKS.easy, BLOCKS.hard, hard))
  const lane = (to - from) / count
  const moving = hard >= BOBBING_FROM
  return Array.from({ length: count }, (_, index): Obstacle => {
    const middle = from + lane * (index + 0.5) + range(rng, -lane * 0.15, lane * 0.15)
    const top = (index + intRange(rng, 0, 1)) % 2 === 0
    return bar(context, index, middle, height, top, moving)
  })
}

/** The gap the other side stays at least a blob and a half wide at both ends of the bob. */
function bar(
  context: GenerateContext,
  index: number,
  x: number,
  height: number,
  top: boolean,
  moving: boolean,
): Obstacle {
  const world = context.world
  const room = world.height - height - BLOB_SIZE * 1.5
  const reach = moving ? Math.min(BOB_REACH, room / 2) : 0
  const homeY = top ? height / 2 + reach : world.height - height / 2 - reach
  const obstacle: Obstacle = {
    id: `${context.id}-block-${index}`,
    x,
    y: homeY,
    width: BLOCK_WIDTH,
    height,
  }
  if (reach <= 0) return obstacle
  obstacle.motion = {
    kind: 'bob',
    homeX: x,
    homeY,
    reachX: 0,
    reachY: reach,
    periodMs: BOB_PERIOD_MS,
    atMs: range(context.rng, 0, BOB_PERIOD_MS),
  }
  return obstacle
}

/** Its sweep stays clear of the top and bottom walls, so a lane is always open whichever way round. */
function spinner(context: GenerateContext, x: number, y: number, hard: number): Obstacle {
  const world = context.world
  const sweep = Math.min(SPIN_LENGTH / 2, world.height / 2 - BLOB_SIZE * 1.5)
  return {
    id: `${context.id}-turner`,
    x,
    y,
    width: BLOCK_WIDTH,
    height: sweep * 2,
    angle: range(context.rng, 0, Math.PI),
    motion: {
      kind: 'spin',
      radiansPerSecond: scale(SPIN_SPEED.easy, SPIN_SPEED.hard, hard) * (context.rng.next() < 0.5 ? 1 : -1),
    },
  }
}
