import { BLOB_SIZE } from './constants.js'
import type { Obstacle } from './obstacles.js'
import { intRange, type Rng } from './rng.js'

/**
 * A maze, carved by a seeded recursive backtracker and emitted as plain
 * `Obstacle` rectangles — which already exist, are already solid, and already
 * slide a blob out of a wall that appears on top of it.
 *
 * It is a *course*, not a task: the race runs through one at the top of its
 * ladder. Which is where it belongs, because a maze on a television is not
 * really a maze — the whole of it is on screen at once and a child can see the
 * way through from where they are standing. What it is, is the most there can
 * be in the way, and "the most there can be in the way" is a rung of the
 * race's course rather than a game of its own.
 *
 * The area it fills is given to it, so the pads at either end of the race stay
 * clear. Only the walls *between* cells are emitted: the edges of the area are
 * the way in and the way out, and a wall as long as the floor is a wall that
 * shuts the floor in half.
 */

/** A patch of floor to carve up: everything between the pads, top to bottom. */
export interface MazeArea {
  /** The left edge and the top edge of it. */
  x: number
  y: number
  width: number
  height: number
}

/** How wide a corridor is at its narrowest: two blobs, near enough. */
export const MAZE_CORRIDOR = BLOB_SIZE * 2
/** How thick a wall is. Thin enough to see past, thick enough to read. */
const MAZE_WALL = 18
/**
 * How likely each wall left standing after the carve is to be knocked through
 * as well: a loop or two, so that a dead end is rarely a proper trap.
 *
 * It is small because a maze this size has few walls to spare — four cells
 * across a race course leaves nine of them — and every one knocked through is
 * a corner the room does not have to turn. A knocked-through maze is a field.
 */
const LOOPS = 0.05

/**
 * The walls of a maze filling this area, in as many cells as will fit without
 * a corridor coming out tight. Every cell is reachable from every other, by
 * construction — so wherever the area is entered, there is a way across it.
 */
export function carveMaze(id: string, rng: Rng, area: MazeArea): Obstacle[] {
  const columns = fits(area.width)
  const rows = fits(area.height)
  return walls(id, carve(rng, columns, rows), columns, rows, area)
}

/** How many cells fit across this much floor with corridors still wide enough. */
export function fits(across: number): number {
  return Math.max(2, Math.floor(across / (MAZE_CORRIDOR + MAZE_WALL)))
}

/**
 * Which walls are still standing, as two flags per cell: the one to its right
 * and the one below it.
 */
interface Grid {
  right: boolean[]
  below: boolean[]
}

function carve(rng: Rng, columns: number, rows: number): Grid {
  const cells = columns * rows
  const grid: Grid = {
    right: Array.from({ length: cells }, () => true),
    below: Array.from({ length: cells }, () => true),
  }
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
    const way = ways[intRange(rng, 0, ways.length - 1)] as Step
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

/**
 * The maze as rectangles. Each wall runs half a thickness past its ends so
 * that the corners meet rather than leaving a nick a blob could squeeze
 * through, and is cut back at the edge of the area, where there is nothing to
 * meet and where a longer wall would start closing the way in.
 */
function walls(id: string, grid: Grid, columns: number, rows: number, area: MazeArea): Obstacle[] {
  const cellW = area.width / columns
  const cellH = area.height / rows
  const made: Obstacle[] = []

  for (let cell = 0; cell < columns * rows; cell++) {
    const column = cell % columns
    const row = Math.floor(cell / columns)
    if (grid.right[cell] === true && column + 1 < columns) {
      const from = Math.max(area.y, area.y + row * cellH - MAZE_WALL / 2)
      const to = Math.min(area.y + area.height, area.y + (row + 1) * cellH + MAZE_WALL / 2)
      made.push({
        id: `${id}-right-${cell}`,
        x: area.x + (column + 1) * cellW,
        y: (from + to) / 2,
        width: MAZE_WALL,
        height: to - from,
      })
    }
    if (grid.below[cell] === true && row + 1 < rows) {
      const from = Math.max(area.x, area.x + column * cellW - MAZE_WALL / 2)
      const to = Math.min(area.x + area.width, area.x + (column + 1) * cellW + MAZE_WALL / 2)
      made.push({
        id: `${id}-below-${cell}`,
        x: (from + to) / 2,
        y: area.y + (row + 1) * cellH,
        width: to - from,
        height: MAZE_WALL,
      })
    }
  }
  return made
}
