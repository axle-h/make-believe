import { BLOB_SIZE } from './constants.js'
import { mergeWalls, type Obstacle } from './obstacles.js'
import { intRange, type Rng } from './rng.js'

/**
 * A seeded recursive backtracker emitted as plain `Obstacle`s, for the top of the race's course. Only walls
 * between cells are emitted, so the edges of the area stay the way in and the way out.
 */

export interface MazeArea {
  /** The top-left corner, unlike an obstacle's centre. */
  x: number
  y: number
  width: number
  height: number
}

/** At its narrowest, two blobs. */
export const MAZE_CORRIDOR = BLOB_SIZE * 2
const MAZE_WALL = 18
/** A loop or two so a dead end is rarely a trap; small, because a knocked-through maze is a field. */
const LOOPS = 0.05

/** Every cell is reachable from every other by construction, so there is always a way across. */
export function carveMaze(id: string, rng: Rng, area: MazeArea): Obstacle[] {
  const columns = fits(area.width)
  const rows = fits(area.height)
  // A straight run of cell walls is merged into one wall so the joins draw cleanly.
  return mergeWalls(walls(id, carve(rng, columns, rows), columns, rows, area))
}

export function fits(across: number): number {
  return Math.max(2, Math.floor(across / (MAZE_CORRIDOR + MAZE_WALL)))
}

/** Two flags per cell: the wall to its right and the wall below it. */
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

function knockThrough(grid: Grid, cell: number, way: Step, columns: number): void {
  if (way.side === 'right') grid.right[cell] = false
  else if (way.side === 'left') grid.right[cell - 1] = false
  else if (way.side === 'below') grid.below[cell] = false
  else grid.below[cell - columns] = false
}

/**
 * Each wall runs half a thickness past its ends so corners leave no nick to squeeze through,
 * and is cut back at the edge of the area so it cannot start closing the way in.
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
