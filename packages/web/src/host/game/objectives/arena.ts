import { BLOB_SIZE } from '../constants.js'
import type { Obstacle } from '../obstacles.js'
import { pick, range } from '../rng.js'
import type { World } from '../state.js'
import { placeZone, zoneReach, type Zone } from '../zones.js'
import { scale, type GenerateContext } from './types.js'

/**
 * Things to drive round, for the tasks whose floor would otherwise be empty.
 *
 * A chase across an empty room is a straight line and whoever is quickest wins
 * it; a chase around a block is a game, because the blob being chased can turn
 * a corner. Carrying an apple across an empty floor is the same straight line,
 * and carrying it round a corner is the same game.
 *
 * There are two shapes of it here, and they are different things. `walls` is a
 * proper **arena** — one big layout in the middle, for the two chases. `litter`
 * is a handful of **small** things scattered clear of everything already on the
 * floor, for the collecting tasks, whose floors are full of pads and parcels
 * and have no middle to give away.
 *
 * Both leave lanes wide enough for two blobs to pass. A wall that traps
 * somebody is a wall that ends the game rather than shaping it, and no task may
 * put a child somewhere they cannot drive out of.
 */

/** A wall before it has been given its id, which the callers hand out. */
type Unnamed = Omit<Obstacle, 'id'>

/** How thick a bar is, and how much of the floor it reaches across. */
const BAR = { thin: 28, thick: 44 }
const BAR_REACH = { easy: 0.45, hard: 0.62 }
/** How big the block in the middle is, as a share of the shorter wall. */
const BLOCK = { easy: 0.22, hard: 0.34 }

/**
 * Something to run round. One layout is picked at random and grows a little as
 * the world gets harder; every one of them leaves lanes wide enough for two
 * blobs to pass, because a wall that traps somebody is a wall that ends the
 * chase rather than shaping it.
 *
 * Hot potato and keep the crown are the same chase inside out and want the same
 * floor, so they share this. The layouts are tuned and are not to be fiddled
 * with by either of them.
 */
export function walls(context: GenerateContext, hard: number): Obstacle[] {
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

/**
 * How hard the world has to be before there is any litter at all.
 *
 * `difficulty` runs 0..1 across the eight rungs, so half of it is level 5. Fetch
 * unlocks at 4, sorting at 6, in order at 7: fetch therefore gets a clear floor
 * on its first outing and picks up litter later, which is the right way round.
 * A four-year-old carrying an apple round a corner is a game, and one who cannot
 * find the corner is not.
 */
export const LITTER_FROM = 0.5
/** How many there are, at the bottom of the range and at the top. */
const LITTER_COUNT = { easy: 2, hard: 4 }
/** Blob-and-a-bit square, give or take a jiggle. Small, and plainly a wall. */
const LITTER_SIZE = BLOB_SIZE * 1.2
/**
 * A zone has to have a colour and a wall is not a zone, so this is the one
 * colour that never reaches a screen: the circles below exist only to keep the
 * next wall off the last one.
 */
const LITTER_COLOUR = '#000000'

/**
 * A few small things in the way, for a task whose floor is otherwise full of
 * pads and parcels. They are placed clear of everything already down, they are
 * small — a blob and a bit — and there are none of them at all until the room
 * is well up the ladder.
 *
 * `placed` is every zone already on the floor. A wall on top of a house is a
 * house nobody can deliver to, so this is called **after** the zones are placed
 * and **before** the carryables are scattered, and the walls it returns are
 * handed to `scatter` so that nothing is dropped inside one.
 *
 * Everything it makes is motionless and unrotated, so `mergeWalls` can be run
 * over the lot and two that happen to abut are drawn as one wall.
 */
export function litter(
  context: GenerateContext,
  hard: number,
  placed: readonly Zone[],
): Obstacle[] {
  if (hard < LITTER_FROM) return []
  // Nothing at the threshold and everything at the top of the ladder, rather
  // than the count jumping to two the moment litter is allowed at all.
  const along = (hard - LITTER_FROM) / (1 - LITTER_FROM)
  const count = Math.round(scale(LITTER_COUNT.easy, LITTER_COUNT.hard, along))

  const { rng, world } = context
  const clear = [...placed]
  const made: Obstacle[] = []
  for (let index = 0; index < count; index++) {
    const width = Math.round(LITTER_SIZE * range(rng, 0.85, 1.15))
    const height = Math.round(LITTER_SIZE * range(rng, 0.85, 1.15))
    // `placeZone` keeps things off each other and off the walls of the world,
    // and a rectangle's reach is its half-diagonal — plus a whole piece again,
    // for the blob that has to get round it carrying something.
    const keepOff = Math.hypot(width, height) / 2 + LITTER_SIZE
    const at = placeZone(rng, world, keepOff, clear)
    // `placeZone` gives up after a few goes and hands back the last spot it
    // tried rather than looping — a generator that can hang is everything. For
    // a pad a slightly close one is nothing; for a wall it is a house nobody
    // can deliver to, so a piece it could not place clear is simply not put
    // down. Litter is decoration, and one fewer is one fewer.
    if (!isClear(at, keepOff, clear)) continue
    const wall: Obstacle = { id: `${context.id}-litter-${index}`, x: at.x, y: at.y, width, height }
    made.push(wall)
    // Counted against the next one, as a circle of its own reach, so that two
    // of them never land on top of each other either.
    clear.push({
      id: wall.id,
      shape: 'circle',
      x: wall.x,
      y: wall.y,
      radius: keepOff,
      colour: LITTER_COLOUR,
    })
  }
  return made
}

/** Whether this spot really is off everything, which `placeZone` only tries to be. */
function isClear(
  at: { x: number; y: number },
  reach: number,
  placed: readonly Zone[],
): boolean {
  return placed.every(
    (zone) => Math.hypot(zone.x - at.x, zone.y - at.y) >= zoneReach(zone) + reach + BLOB_SIZE,
  )
}
