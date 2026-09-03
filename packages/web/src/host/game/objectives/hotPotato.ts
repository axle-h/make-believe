import { nearestTouching } from '../collisions.js'
import { BLOB_SIZE, MAX_LEVEL } from '../constants.js'
import type { Obstacle } from '../obstacles.js'
import { pick, range } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState, World } from '../state.js'
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
 * Hot potato. One blob has it, touching somebody else passes it on, and
 * whoever is holding it when the buzzer goes is the one everybody laughs at.
 *
 * It is the first task that is not cooperative, which is what proves the
 * director is not shaped only around everybody wanting the same thing.
 *
 * It is also the one task with walls on the floor. A chase across an empty
 * room is a straight line and whoever is quickest wins it; a chase around a
 * block is a game, because the blob being chased can turn a corner. The walls
 * appear with the task, and anybody standing where one lands is slid out of
 * the way over a few frames rather than jumped somewhere else.
 *
 * Nobody is eliminated, nothing is taken away, and the score still goes up at
 * the end — being caught with it is the joke, not a punishment. The youngest
 * player is three.
 */

export interface HotPotatoObjective extends ObjectiveBase {
  kind: 'hotPotato'
  /** Whoever is holding it, or `null` for the instant before anybody is. */
  it: string | null
  /** How long a fresh hold lasts before a touch can pass it on again. */
  graceMs: number
  /** How long the current blob has had it. */
  heldForMs: number
}

/** The potato itself, worn by whoever has it. */
const POTATO = '🥔'

/** How long you are safe for after catching it. Long enough to get away. */
const GRACE = { easy: 1_200, hard: 700 }
/** How long the whole thing lasts before somebody is caught with it. */
const TIME_LIMIT = { easy: 30_000, hard: 18_000 }

export const hotPotato: ObjectiveTemplate<HotPotatoObjective> = {
  kind: 'hotPotato',
  title: 'Hot potato',
  /**
   * Three. Two blobs is not a chase but a tag-back: touch, be touched, touch
   * again, and the potato does nothing but flicker between the only two blobs
   * there are. It wants somebody to run *to* as well as somebody to run from.
   */
  minPlayers: 3,
  /**
   * Not the first thing a room is ever asked to do. Everybody stands on a spot
   * together for a while first, which teaches the joystick; being chased is
   * more fun once driving is not the hard part.
   */
  minLevel: 2,

  generate(context: GenerateContext): HotPotatoObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng } = context
    const start = pick(rng, context.players)
    // A little jiggle either way, so two goes at the same level are not twins.
    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard) * range(rng, 0.9, 1.1))
    return {
      kind: 'hotPotato',
      id: context.id,
      headline: 'Hot potato!',
      remainingMs: totalMs,
      totalMs,
      zones: [],
      obstacles: walls(context, hard),
      marks: marksFor(start.playerId),
      carryables: [],
      outcome: 'running',
      note: null,
      it: start.playerId,
      graceMs: Math.round(scale(GRACE.easy, GRACE.hard, hard)),
      heldForMs: 0,
    }
  },

  /**
   * Judged against whoever is here *now*. A phone that has been put down takes
   * its blob out of the chase, and if it was the one holding the potato the
   * potato has to land somewhere else — a task that ended because a
   * three-year-old wandered off with it would end most of the time.
   */
  step(objective, state, dtMs) {
    const present = activePlayers(state)
    if (present.length === 0) return

    const holder = present.find((player) => player.playerId === objective.it)
    if (!holder) {
      handTo(objective, pick(state.objectives.rng, present).playerId)
      return
    }

    objective.heldForMs += dtMs
    if (objective.heldForMs >= objective.graceMs) {
      const caught = nearestTouching(holder, present)
      if (caught) handTo(objective, caught.playerId)
    }

    // The buzzer is the end of it rather than a failure to finish in time, so
    // this says so itself before the director can call it a miss.
    if (objective.remainingMs <= 0) {
      objective.outcome = 'done'
      objective.note = `${nameOf(state, objective.it) ?? 'Somebody'} was left holding it!`
    }
  },

  briefs(objective, state) {
    const holder = activePlayers(state).find((player) => player.playerId === objective.it)
    // Everybody gets the same line, so it has to read the same to the blob
    // being chased as to the one doing the chasing: it says who has it and
    // leaves the running to them. Telling each phone its own half of a task is
    // a trick worth having, and worth spending on a task built around it.
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: holder ? `${holder.name} has it!` : 'Nobody has it…',
      tone: 'task',
    }
    // The strip goes the colour of whoever is holding it, so a child who
    // cannot read the name still sees it change hands.
    if (holder) brief.colour = holder.colour
    return [brief]
  },
}

/**
 * Something to run round. One layout is picked at random and grows a little as
 * the world gets harder; every one of them leaves lanes wide enough for two
 * blobs to pass, because a wall that traps somebody is a wall that ends the
 * chase rather than shaping it.
 */
function walls(context: GenerateContext, hard: number): Obstacle[] {
  const { world, rng } = context
  // A comfortable lane is two blobs wide: one being chased, one chasing, and
  // room to be wrong about it.
  const lane = BLOB_SIZE * 2
  const thickness = Math.round(scale(BAR.thin, BAR.thick, hard))
  const layouts: (() => Unnamed[])[] = [
    () => [bar(world, 'across', thickness, hard)],
    () => [bar(world, 'down', thickness, hard)],
    () => [block(world, hard)],
    () => [bar(world, 'across', thickness, hard), bar(world, 'down', thickness, hard)],
    () => pillars(world, hard, lane),
  ]
  // Named here rather than by each builder: a layout should be a shape, and
  // the shapes are put together out of the same two or three pieces.
  const built: Obstacle[] = []
  for (const [index, wall] of pick(rng, layouts)().entries()) {
    built.push(Object.assign(wall, { id: `${context.id}-wall-${index}` }))
  }
  return built
}

/** A wall before it has been given its id, which `walls` hands out. */
type Unnamed = Omit<Obstacle, 'id'>

/** How thick a bar is, and how much of the floor it reaches across. */
const BAR = { thin: 28, thick: 44 }
const BAR_REACH = { easy: 0.45, hard: 0.62 }
/** How big the block in the middle is, as a share of the shorter wall. */
const BLOCK = { easy: 0.22, hard: 0.34 }

/**
 * A bar across the middle, stopping well short of both walls. It is never the
 * full width: a floor cut in two is a floor half the blobs cannot get out of.
 */
function bar(world: World, way: 'across' | 'down', thickness: number, hard: number): Unnamed {
  const reach = scale(BAR_REACH.easy, BAR_REACH.hard, hard)
  const long = Math.round((way === 'across' ? world.width : world.height) * reach)
  return {
    x: world.width / 2,
    y: world.height / 2,
    width: way === 'across' ? long : thickness,
    height: way === 'across' ? thickness : long,
  }
}

/** A square in the middle, to go round one way or the other. */
function block(world: World, hard: number): Unnamed {
  const side = Math.round(world.height * scale(BLOCK.easy, BLOCK.hard, hard))
  return { x: world.width / 2, y: world.height / 2, width: side, height: side }
}

/** Two of them, a third of the way in each side, with a lane between. */
function pillars(world: World, hard: number, lane: number): Unnamed[] {
  const side = Math.round(world.height * scale(BLOCK.easy, BLOCK.hard, hard))
  // Never so tall that the gap above and below them closes up.
  const height = Math.min(side, world.height / 2 - lane)
  return [world.width / 3, (world.width * 2) / 3].map((x) => ({
    x,
    y: world.height / 2,
    width: side,
    height,
  }))
}

/** Give it to somebody, and start their few seconds of safety again. */
function handTo(objective: HotPotatoObjective, playerId: string): void {
  objective.it = playerId
  objective.heldForMs = 0
  objective.marks = marksFor(playerId)
}

function marksFor(playerId: string): Mark[] {
  return [{ playerId, badge: POTATO }]
}

function nameOf(state: GameState, playerId: string | null): string | null {
  if (playerId === null) return null
  return state.players.get(playerId)?.name ?? null
}
