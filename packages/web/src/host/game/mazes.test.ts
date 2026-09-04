import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { carveMaze, fits, MAZE_CORRIDOR, type MazeArea } from './mazes.js'
import { insideObstacle, type Obstacle } from './obstacles.js'
import { createRng } from './rng.js'

/**
 * The carve, on its own. It is a course rather than a task — the race runs
 * through one at the top of its ladder — so what has to be true of it is what
 * has to be true of any floor: there is a way across, and there is room to
 * drive down it.
 */

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
  /** Every cell reaches every other, by construction. */
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

  it('makes corners rather than a field, but leaves a loop or two', () => {
    for (let seed = 0; seed < 20; seed++) {
      const walls = maze(seed)
      // A four by four grid has nine walls in a perfect maze; a knocked-
      // through one is a field, and nine of nine is a maze with no way round
      // a wrong turn.
      expect(walls.length).toBeGreaterThan(5)
      expect(walls.length).toBeLessThanOrEqual(9)
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

  /**
   * Nowhere is walled off. A perfect maze has no sealed pockets in it, and a
   * pocket is the one thing that would put a blob somewhere it cannot drive
   * out of — so this walks the whole floor and checks that every patch of it
   * that is not a wall can be got to.
   */
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
