import { BLOB_SIZE } from '../constants.js'
import type { Obstacle } from '../obstacles.js'
import { pick, range } from '../rng.js'
import type { World } from '../state.js'
import { placeZone, zoneReach, type Zone } from '../zones.js'
import { scale, type GenerateContext } from './types.js'

// Every layout leaves lanes two blobs wide: no wall may put a blob somewhere it cannot drive out of.

type Unnamed = Omit<Obstacle, 'id'>

const BAR = { thin: 28, thick: 44 }
const BAR_REACH = { easy: 0.45, hard: 0.62 }
const BLOCK = { easy: 0.22, hard: 0.34 }

/** One big layout in the middle for the chases, shared by hot potato and keep the crown. */
export function walls(context: GenerateContext, hard: number): Obstacle[] {
  const { world, rng } = context
  const lane = BLOB_SIZE * 2
  const thickness = Math.round(scale(BAR.thin, BAR.thick, hard))
  const layouts: (() => Unnamed[])[] = [
    () => [bar(world, 'across', thickness, hard)],
    () => [bar(world, 'down', thickness, hard)],
    () => [block(world, hard)],
    () => [bar(world, 'across', thickness, hard), bar(world, 'down', thickness, hard)],
    () => pillars(world, hard, lane),
  ]
  const built: Obstacle[] = []
  for (const [index, wall] of pick(rng, layouts)().entries()) {
    built.push(Object.assign(wall, { id: `${context.id}-wall-${index}` }))
  }
  return built
}

/** Never the full width: a floor cut in two traps half the blobs. */
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

function block(world: World, hard: number): Unnamed {
  const side = Math.round(world.height * scale(BLOCK.easy, BLOCK.hard, hard))
  return { x: world.width / 2, y: world.height / 2, width: side, height: side }
}

function pillars(world: World, hard: number, lane: number): Unnamed[] {
  const side = Math.round(world.height * scale(BLOCK.easy, BLOCK.hard, hard))
  // Never so tall that the lane above and below closes.
  const height = Math.min(side, world.height / 2 - lane)
  return [world.width / 3, (world.width * 2) / 3].map((x) => ({
    x,
    y: world.height / 2,
    width: side,
    height,
  }))
}

/** Below this difficulty there is no litter, so fetch gets a clear floor on its first outing. */
export const LITTER_FROM = 0.5
const LITTER_COUNT = { easy: 2, hard: 4 }
const LITTER_SIZE = BLOB_SIZE * 1.2
/** Never reaches a screen: the circles it colours only keep the next wall off the last. */
const LITTER_COLOUR = '#000000'

/**
 * Small walls clear of every zone in `placed`, so call it after the zones and before `scatter`.
 * Everything it makes is motionless and unrotated, which `mergeWalls` relies on.
 */
export function litter(
  context: GenerateContext,
  hard: number,
  placed: readonly Zone[],
): Obstacle[] {
  if (hard < LITTER_FROM) return []
  const along = (hard - LITTER_FROM) / (1 - LITTER_FROM)
  const count = Math.round(scale(LITTER_COUNT.easy, LITTER_COUNT.hard, along))

  const { rng, world } = context
  const clear = [...placed]
  const made: Obstacle[] = []
  for (let index = 0; index < count; index++) {
    const width = Math.round(LITTER_SIZE * range(rng, 0.85, 1.15))
    const height = Math.round(LITTER_SIZE * range(rng, 0.85, 1.15))
    // Half-diagonal plus a whole piece, for a blob getting round it carrying something.
    const keepOff = Math.hypot(width, height) / 2 + LITTER_SIZE
    const at = placeZone(rng, world, keepOff, clear)
    // `placeZone` may hand back a spot that is not clear; a wall there could block a house, so skip it.
    if (!isClear(at, keepOff, clear)) continue
    const wall: Obstacle = { id: `${context.id}-litter-${index}`, x: at.x, y: at.y, width, height }
    made.push(wall)
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

function isClear(
  at: { x: number; y: number },
  reach: number,
  placed: readonly Zone[],
): boolean {
  return placed.every(
    (zone) => Math.hypot(zone.x - at.x, zone.y - at.y) >= zoneReach(zone) + reach + BLOB_SIZE,
  )
}
