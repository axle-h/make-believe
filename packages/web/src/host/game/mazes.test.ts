import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { carveMaze, fits, MAZE_CORRIDOR, type MazeArea } from './mazes.js'
import { insideObstacle, type Obstacle } from './obstacles.js'
import { createRng } from './rng.js'

/** A carved maze has a way across and room to drive down it, as any floor must. */

const AREA: MazeArea = { x: 300, y: 0, width: 680, height: WORLD_HEIGHT }

function maze(seed: number, area: MazeArea = AREA): Obstacle[] {
  return carveMaze('obj-1', createRng(seed), area)
}

/** Everywhere a blob could drive to from here, on a fine grid of the world. */
function flood(walls: readonly Obstacle[], from: { x: number; y: number }): Set<number> {
  const step = BLOB_SIZE / 2
  const across = Math.floor(WORLD_WIDTH / step)
  const down = Math.floor(WORLD_HEIGHT / step)
  const key = (column: number, row: number) => row * across + column
  const blocked = (column: number, row: number) =>
    walls.some((wall) => insideObstacle(wall, column * step + step / 2, row * step + step / 2))

  const seen = new Set<number>()
  const start: [number, number] = [Math.floor(from.x / step), Math.floor(from.y / step)]
  const queue: [number, number][] = [start]
  seen.add(key(...start))
  while (queue.length > 0) {
    const [column, row] = queue.shift() as [number, number]
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next: [number, number] = [column + dx, row + dy]
      if (next[0] < 0 || next[1] < 0 || next[0] >= across || next[1] >= down) continue
      if (seen.has(key(...next)) || blocked(...next)) continue
      seen.add(key(...next))
      queue.push(next)
    }
  }
  return seen
}

describe('carving one', () => {
  it('always leaves a way from one side of it to the other', () => {
    const step = BLOB_SIZE / 2
    const across = Math.floor(WORLD_WIDTH / step)
    for (let seed = 0; seed < 20; seed++) {
      const walls = maze(seed)
      const reached = flood(walls, { x: 40, y: WORLD_HEIGHT / 2 })
      const far: [number, number] = [
        Math.floor((WORLD_WIDTH - 40) / step),
        Math.floor(WORLD_HEIGHT / 2 / step),
      ]

      expect(reached.has(far[1] * across + far[0])).toBe(true)
    }
  })

  /** Measured in length of wall rather than count, since merging changes the count and not the wall. */
  it('makes corners rather than a field, but leaves a loop or two', () => {
    // A perfect four by four maze leaves nine cell walls standing, each about a cell long.
    const cell = AREA.height / 4
    for (let seed = 0; seed < 20; seed++) {
      const wall = maze(seed).reduce((sum, one) => sum + Math.max(one.width, one.height), 0)

      expect(wall / cell).toBeGreaterThan(5)
      expect(wall / cell).toBeLessThanOrEqual(10)
    }
  })

  /** Nothing left in a carved maze is collinear with a neighbour it touches. */
  it('gives back one rectangle per run rather than one per cell wall', () => {
    for (let seed = 0; seed < 20; seed++) {
      const walls = maze(seed)
      for (const one of walls) {
        for (const other of walls) {
          if (one === other) continue
          const sameColumn = one.x === other.x && one.width === other.width
          const sameRow = one.y === other.y && one.height === other.height
          if (!sameColumn && !sameRow) continue
          const gap = sameColumn
            ? Math.abs(one.y - other.y) - (one.height + other.height) / 2
            : Math.abs(one.x - other.x) - (one.width + other.width) / 2
          expect(gap).toBeGreaterThan(0)
        }
      }
    }
  })

  it('keeps every corridor wide enough for two blobs to pass', () => {
    expect(MAZE_CORRIDOR).toBe(BLOB_SIZE * 2)
    for (const across of [400, 680, WORLD_WIDTH]) {
      expect(across / fits(across)).toBeGreaterThanOrEqual(MAZE_CORRIDOR)
    }
    expect(fits(100)).toBe(2)
  })

  it('stays inside the patch of floor it was given', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const wall of maze(seed)) {
        expect(wall.x - wall.width / 2).toBeGreaterThanOrEqual(AREA.x - 0.001)
        expect(wall.x + wall.width / 2).toBeLessThanOrEqual(AREA.x + AREA.width + 0.001)
        expect(wall.y - wall.height / 2).toBeGreaterThanOrEqual(AREA.y - 0.001)
        expect(wall.y + wall.height / 2).toBeLessThanOrEqual(AREA.y + AREA.height + 0.001)
      }
      expect(new Set(maze(seed).map((wall) => wall.id)).size).toBe(maze(seed).length)
    }
  })

  /** Every patch of floor that is not wall can be reached, so no blob can be sealed in. */
  it('seals nothing off, anywhere on the floor', () => {
    const step = BLOB_SIZE / 2
    const across = Math.floor(WORLD_WIDTH / step)
    const down = Math.floor(WORLD_HEIGHT / step)
    for (let seed = 0; seed < 20; seed++) {
      const walls = maze(seed)
      const reached = flood(walls, { x: 40, y: WORLD_HEIGHT / 2 })
      for (let column = 0; column < across; column++) {
        for (let row = 0; row < down; row++) {
          const middle = { x: column * step + step / 2, y: row * step + step / 2 }
          if (walls.some((wall) => insideObstacle(wall, middle.x, middle.y))) continue
          expect(reached.has(row * across + column)).toBe(true)
        }
      }
    }
  })

  it('is the same maze twice from the same seed, and a different one from another', () => {
    expect(maze(7)).toEqual(maze(7))
    expect(maze(7)).not.toEqual(maze(8))
  })
})
