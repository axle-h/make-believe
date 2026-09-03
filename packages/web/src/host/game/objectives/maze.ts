import { BLOB_SIZE, MAX_LEVEL, ZONE_COLOURS } from '../constants.js'
import type { Obstacle } from '../obstacles.js'
import { intRange, type Rng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { World } from '../state.js'
import { blobsIn, type CircleZone } from '../zones.js'
import {
  difficulty,
  scale,
  type Brief,
  type GenerateContext,
  type ObjectiveBase,
  type ObjectiveTemplate,
} from './types.js'

/**
 * The maze. Walls all over the floor, a carrot at the end of it, and whoever
 * gets there first has won it for the room.
 *
 * It is carved by a seeded recursive backtracker and comes out as plain
 * `Obstacle` rectangles, which already exist, are already solid, and already
 * slide a blob out of a wall that appears on top of it — which is exactly what
 * happens here. Nobody is moved to a starting line: the maze grows around
 * everybody where they stand, and whoever it puts in a wall is eased into the
 * nearest corridor over a few frames where they can see it happen. A game that
 * picks a child's blob up and puts it somewhere else has taken the joystick
 * off them for a moment, and this one never does.
 *
 * **Done when anybody reaches the carrot**, rather than when it is carried
 * back out. A three-year-old who gets there has won it for the room, and the
 * rest of them were doing the same maze.
 */

export interface MazeObjective extends ObjectiveBase {
  kind: 'maze'
  /** How big the grid is, for the brief and for the tests. */
  columns: number
  rows: number
}

/** How wide a corridor is at its narrowest: two blobs, near enough. */
export const MAZE_CORRIDOR = BLOB_SIZE * 2
/** How thick a wall is. Thin enough to see past, thick enough to read. */
const MAZE_WALL = 18
/** How big the grid gets. Never so big that a corridor gets tight. */
const COLUMNS = { easy: 4, hard: 7 }
const ROWS = { easy: 2, hard: 4 }
/**
 * How many of the walls left standing after the carve are knocked through.
 * Six blobs and one true dead end is six blobs wedged in a corner, and the
 * collision separation is not going to sort that out.
 */
const LOOPS = 0.18
const TIME_LIMIT = { easy: 60_000, hard: 48_000 }

export const maze: ObjectiveTemplate<MazeObjective> = {
  kind: 'maze',
  title: 'The maze',
  /** One blob in a maze is a puzzle; a room in one is a race with corners. */
  minPlayers: 2,
  /** Well up: it is the only task where a blob can lose sight of the point. */
  minLevel: 6,

  generate(context: GenerateContext): MazeObjective {
    const hard = difficulty(context.level, MAX_LEVEL)
    const { rng, world } = context
    const columns = fits(Math.round(scale(COLUMNS.easy, COLUMNS.hard, hard)), world.width)
    const rows = fits(Math.round(scale(ROWS.easy, ROWS.hard, hard)), world.height)
    const grid = carve(rng, columns, rows)

    // The far end of it, from the middle of the floor: wherever a blob is
    // standing when the walls go up, there is a proper run to make.
    const from = at(columns, rows, world, world.width / 2, world.height / 2)
    const end = furthestFrom(grid, columns, rows, from)
    const cellW = world.width / columns
    const cellH = world.height / rows

    const carrot: CircleZone = {
      id: `${context.id}-carrot`,
      shape: 'circle',
      x: (end % columns) * cellW + cellW / 2,
      y: Math.floor(end / columns) * cellH + cellH / 2,
      radius: Math.min(cellW, cellH) / 2 - MAZE_WALL,
      colour: ZONE_COLOURS[2]?.hex ?? '#ffe08a',
      label: '🥕',
      labelSize: 54,
    }

    const totalMs = Math.round(scale(TIME_LIMIT.easy, TIME_LIMIT.hard, hard))
    return {
      kind: 'maze',
      id: context.id,
      headline: 'Find the carrot!',
      remainingMs: totalMs,
      totalMs,
      zones: [carrot],
      obstacles: walls(context.id, grid, columns, rows, world),
      marks: [],
      carryables: [],
      outcome: 'running',
      note: null,
      columns,
      rows,
    }
  },

  step(objective, state) {
    const carrot = objective.zones[0]
    if (!carrot) return
    const finder = blobsIn(carrot, activePlayers(state))[0]
    if (!finder) return
    objective.outcome = 'done'
    objective.note = `${finder.name} found it!`
  },

  briefs(objective, state) {
    const carrot = objective.zones[0]
    const brief: Brief = {
      to: '*',
      headline: objective.headline,
      detail: `${activePlayers(state).length} of you, one carrot. Anybody!`,
      tone: 'task',
    }
    if (carrot) brief.colour = carrot.colour
    return [brief]
  },
}

/** As many cells as will fit without a corridor coming out tight. */
function fits(wanted: number, across: number): number {
  const most = Math.floor(across / (MAZE_CORRIDOR + MAZE_WALL))
  return Math.max(2, Math.min(wanted, most))
}

/** Which cell a point on the floor is in. */
function at(columns: number, rows: number, world: World, x: number, y: number): number {
  const column = Math.min(columns - 1, Math.floor((x / world.width) * columns))
  const row = Math.min(rows - 1, Math.floor((y / world.height) * rows))
  return row * columns + column
}

/**
 * Which walls are still standing, as two flags per cell: the one to its right
 * and the one below it. A recursive backtracker knocks them through — every
 * cell reachable from every other, by construction — and then a few more come
 * out at random, because six blobs and one true dead end is six blobs wedged
 * in a corner.
 */
interface Grid {
  /** True while the wall to the right of this cell is still there. */
  right: boolean[]
  /** True while the wall below this cell is still there. */
  below: boolean[]
}

function carve(rng: Rng, columns: number, rows: number): Grid {
  const cells = columns * rows
  const grid: Grid = { right: Array.from({ length: cells }, () => true), below: Array.from({ length: cells }, () => true) }
  const seen = Array.from({ length: cells }, () => false)
  const path: number[] = [0]
  seen[0] = true

  while (path.length > 0) {
    const cell = path.at(-1) as number
    const ways = neighbours(cell, columns, rows).filter((step) => !seen[step.cell])
    if (ways.length === 0) {
      path.pop()
      continue
    }
    const way = ways[intRange(rng, 0, ways.length - 1)] as (typeof ways)[number]
    knockThrough(grid, cell, way, columns)
    seen[way.cell] = true
    path.push(way.cell)
  }

  // And a few loops, so that a dead end is rarely a proper trap.
  for (let cell = 0; cell < cells; cell++) {
    for (const way of neighbours(cell, columns, rows)) {
      if (rng.next() >= LOOPS) continue
      knockThrough(grid, cell, way, columns)
    }
  }
  return grid
}

interface Step {
  cell: number
  side: 'right' | 'below' | 'left' | 'above'
}

function neighbours(cell: number, columns: number, rows: number): Step[] {
  const column = cell % columns
  const row = Math.floor(cell / columns)
  const ways: Step[] = []
  if (column + 1 < columns) ways.push({ cell: cell + 1, side: 'right' })
  if (column > 0) ways.push({ cell: cell - 1, side: 'left' })
  if (row + 1 < rows) ways.push({ cell: cell + columns, side: 'below' })
  if (row > 0) ways.push({ cell: cell - columns, side: 'above' })
  return ways
}

/** The wall between these two cells, gone. */
function knockThrough(grid: Grid, cell: number, way: Step, columns: number): void {
  if (way.side === 'right') grid.right[cell] = false
  else if (way.side === 'left') grid.right[cell - 1] = false
  else if (way.side === 'below') grid.below[cell] = false
  else grid.below[cell - columns] = false
}

/** Whether you can walk straight from one cell to the next. */
export function isOpen(grid: Grid, cell: number, way: Step, columns: number): boolean {
  if (way.side === 'right') return grid.right[cell] === false
  if (way.side === 'left') return grid.right[cell - 1] === false
  if (way.side === 'below') return grid.below[cell] === false
  return grid.below[cell - columns] === false
}

/** The cell it takes the most turns to walk to from here. */
function furthestFrom(grid: Grid, columns: number, rows: number, from: number): number {
  const steps = Array.from({ length: columns * rows }, () => -1)
  steps[from] = 0
  const queue = [from]
  let furthest = from
  while (queue.length > 0) {
    const cell = queue.shift() as number
    for (const way of neighbours(cell, columns, rows)) {
      if (!isOpen(grid, cell, way, columns) || steps[way.cell] !== -1) continue
      steps[way.cell] = (steps[cell] as number) + 1
      if ((steps[way.cell] as number) > (steps[furthest] as number)) furthest = way.cell
      queue.push(way.cell)
    }
  }
  return furthest
}

/**
 * The maze as rectangles. Only the walls between cells: the floor's own edges
 * are the outside of it, and a wall as long as the floor is a wall that shuts
 * the floor in half.
 *
 * Each one runs half a wall's thickness past its ends, so that the corners
 * meet rather than leaving a nick a blob could squeeze through — and is cut
 * back at the floor's own edge, where there is nothing to meet.
 */
function walls(id: string, grid: Grid, columns: number, rows: number, world: World): Obstacle[] {
  const cellW = world.width / columns
  const cellH = world.height / rows
  const made: Obstacle[] = []

  for (let cell = 0; cell < columns * rows; cell++) {
    const column = cell % columns
    const row = Math.floor(cell / columns)
    if (grid.right[cell] === true && column + 1 < columns) {
      const from = Math.max(0, row * cellH - MAZE_WALL / 2)
      const to = Math.min(world.height, (row + 1) * cellH + MAZE_WALL / 2)
      made.push({
        id: `${id}-right-${cell}`,
        x: (column + 1) * cellW,
        y: (from + to) / 2,
        width: MAZE_WALL,
        height: to - from,
      })
    }
    if (grid.below[cell] === true && row + 1 < rows) {
      const from = Math.max(0, column * cellW - MAZE_WALL / 2)
      const to = Math.min(world.width, (column + 1) * cellW + MAZE_WALL / 2)
      made.push({
        id: `${id}-below-${cell}`,
        x: (from + to) / 2,
        y: (row + 1) * cellH,
        width: to - from,
        height: MAZE_WALL,
      })
    }
  }
  return made
}
