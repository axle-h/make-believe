import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, MAX_LEVEL, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { insideObstacle } from '../obstacles.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { tick } from '../tick.js'
import { maze, MAZE_CORRIDOR, type MazeObjective } from './maze.js'

/**
 * Walls all over the floor and a carrot at the end. Two things have to be true
 * of every maze this makes: there is a way through it, and there is room to
 * drive down it.
 */

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) joinPlayer(state, `p${index}`, `B${index}`)
  return state
}

function make(state: GameState, level = 6, seed = 3): MazeObjective {
  return maze.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

/**
 * Whether a blob could actually walk from one point to another, worked out on
 * a fine grid of the floor rather than on the maze's own: it is the walls as
 * they were emitted that a blob meets, not the grid they came from.
 */
function reachable(objective: MazeObjective, from: { x: number; y: number }): (spot: {
  x: number
  y: number
}) => boolean {
  const step = BLOB_SIZE / 2
  const across = Math.floor(WORLD_WIDTH / step)
  const down = Math.floor(WORLD_HEIGHT / step)
  const key = (column: number, row: number) => row * across + column
  const blocked = (column: number, row: number) =>
    objective.obstacles.some((wall) =>
      insideObstacle(wall, column * step + step / 2, row * step + step / 2),
    )

  const seen = new Set<number>()
  const start: [number, number] = [
    Math.floor(from.x / step),
    Math.floor(from.y / step),
  ]
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
  return (spot) => seen.has(key(Math.floor(spot.x / step), Math.floor(spot.y / step)))
}

describe('carving one', () => {
  /** A maze with no way through is a task the room cannot finish. */
  it('always leaves a way from one side of the floor to the carrot', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let seed = 0; seed < 8; seed++) {
        const objective = make(room(3), level, seed)
        const carrot = objective.zones[0]!
        const canReach = reachable(objective, { x: BLOB_SIZE, y: WORLD_HEIGHT / 2 })
        expect(canReach({ x: carrot.x, y: carrot.y })).toBe(true)
      }
    }
  })

  it('keeps every corridor wide enough to drive down', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const objective = make(room(3), level, level)
      const cellW = WORLD_WIDTH / objective.columns
      const cellH = WORLD_HEIGHT / objective.rows

      expect(Math.min(cellW, cellH)).toBeGreaterThanOrEqual(MAZE_CORRIDOR)
      expect(MAZE_CORRIDOR).toBeGreaterThanOrEqual(BLOB_SIZE * 1.5)
    }
  })

  it('gets bigger as the level goes up, and never bigger than the floor', () => {
    const easy = make(room(3), 1)
    const hard = make(room(3), MAX_LEVEL)

    expect(hard.columns * hard.rows).toBeGreaterThan(easy.columns * easy.rows)
    for (const objective of [easy, hard]) {
      expect(WORLD_WIDTH / objective.columns).toBeGreaterThanOrEqual(MAZE_CORRIDOR)
      expect(WORLD_HEIGHT / objective.rows).toBeGreaterThanOrEqual(MAZE_CORRIDOR)
    }
  })

  /** Somewhere with a proper run to it, wherever a blob happens to be. */
  it('puts the carrot well away from the middle of the floor', () => {
    for (let seed = 0; seed < 10; seed++) {
      const carrot = make(room(3), MAX_LEVEL, seed).zones[0]!
      const gap = Math.hypot(carrot.x - WORLD_WIDTH / 2, carrot.y - WORLD_HEIGHT / 2)
      expect(gap).toBeGreaterThan(WORLD_HEIGHT / 4)
    }
  })

  /**
   * Nobody is picked up and put at a starting line: the maze grows around
   * everybody where they stand, and whoever it puts in a wall is eased into
   * the nearest corridor over a few frames, exactly as any wall does.
   */
  it('leaves nobody standing in a wall for long', () => {
    const state = room(6)
    const objective = make(state)
    state.objectives.current = objective
    const before = activePlayers(state).map((player) => ({ x: player.x, y: player.y }))

    for (let frame = 0; frame < 60; frame++) tick(state, 16)

    for (const player of activePlayers(state)) {
      for (const wall of objective.obstacles) {
        expect(insideObstacle(wall, player.x, player.y)).toBe(false)
      }
    }
    // And nobody was carried off across the floor to get there.
    for (const [index, player] of activePlayers(state).entries()) {
      const was = before[index]!
      expect(Math.hypot(player.x - was.x, player.y - was.y)).toBeLessThan(BLOB_SIZE * 2)
    }
  })
})

describe('finding it', () => {
  it('is done the moment anybody reaches the carrot', () => {
    const state = room(3)
    const objective = make(state)
    const carrot = objective.zones[0]!
    const finder = state.players.get('p2')!
    finder.x = carrot.x
    finder.y = carrot.y

    maze.step(objective, state, 16)

    expect(objective.outcome).toBe('done')
    expect(objective.note).toContain(finder.name)
  })

  it('is not done by anybody still looking', () => {
    const state = room(3)
    const objective = make(state)

    for (let frame = 0; frame < 100; frame++) maze.step(objective, state, 100)

    expect(objective.outcome).toBe('running')
  })

  it('says what it wants, in the colour of the carrot', () => {
    const state = room(3)
    const objective = make(state)

    const [brief] = maze.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.headline).toBe('Find the carrot!')
    expect(brief?.colour).toBe(objective.zones[0]?.colour)
  })
})
