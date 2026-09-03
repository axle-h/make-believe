import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { BLOB_SIZE } from './constants.js'
import {
  insideObstacle,
  pushOutOfObstacles,
  stepObstacles,
  PUSH_OUT_SPEED,
  type Obstacle,
} from './obstacles.js'
import { createGame, type GameState, type Player } from './state.js'
import { joinPlayer } from './testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

function put(state: GameState, playerId: string, x: number, y: number): Player {
  const player = state.players.get(playerId)!
  player.x = x
  player.y = y
  return player
}

const WALL: Obstacle = { id: 'w', x: 640, y: 360, width: 200, height: 40 }

describe('standing in a wall', () => {
  it('knows a blob overlapping one from a blob beside it', () => {
    expect(insideObstacle(WALL, 640, 360)).toBe(true)
    // Edge to edge is out: the blob's own width is half of the sum.
    expect(insideObstacle(WALL, 640, 360 + (BLOB_SIZE + WALL.height) / 2)).toBe(false)
    expect(insideObstacle(WALL, 640, 360 + (BLOB_SIZE + WALL.height) / 2 - 1)).toBe(true)
  })
})

describe('pushing a blob out of a wall', () => {
  it('gives way along whichever side is nearest', () => {
    const state = room(1)
    // Just inside the top of a wide, thin bar: up is much the shorter way out.
    const player = put(state, 'p1', 640, 360 - 20)

    pushOutOfObstacles(state, [WALL], 1_000)

    expect(insideObstacle(WALL, player.x, player.y)).toBe(false)
    expect(player.x).toBe(640)
    expect(player.y).toBeLessThan(360)
  })

  it('goes out of the near end of a tall wall sideways', () => {
    const state = room(1)
    const post: Obstacle = { id: 'w', x: 640, y: 360, width: 40, height: 300 }
    const player = put(state, 'p1', 640 + 20, 360)

    pushOutOfObstacles(state, [post], 1_000)

    expect(insideObstacle(post, player.x, player.y)).toBe(false)
    expect(player.x).toBeGreaterThan(640)
    expect(player.y).toBe(360)
  })

  /**
   * The walls arrive with the task, on top of whoever was standing there. A
   * blob that vanished and reappeared somewhere else would be a blob whose
   * child has no idea what happened to it.
   */
  it('slides a blob out over several frames rather than teleporting it', () => {
    const state = room(1)
    const big: Obstacle = { id: 'w', x: 640, y: 360, width: 400, height: 400 }
    const player = put(state, 'p1', 640, 360)
    const started = { x: player.x, y: player.y }

    pushOutOfObstacles(state, [big], 16)

    const step = Math.hypot(player.x - started.x, player.y - started.y)
    expect(step).toBeGreaterThan(0)
    expect(step).toBeCloseTo((PUSH_OUT_SPEED * 16) / 1000, 5)
    expect(insideObstacle(big, player.x, player.y)).toBe(true)
  })

  it('gets there in the end, given enough frames', () => {
    const state = room(1)
    const big: Obstacle = { id: 'w', x: 640, y: 360, width: 400, height: 400 }
    const player = put(state, 'p1', 640, 360)

    for (let frame = 0; frame < 60; frame++) pushOutOfObstacles(state, [big], 16)

    expect(insideObstacle(big, player.x, player.y)).toBe(false)
  })

  it('leaves a blob that is nowhere near one exactly where it was', () => {
    const state = room(1)
    const player = put(state, 'p1', 200, 200)

    pushOutOfObstacles(state, [WALL], 16)

    expect({ x: player.x, y: player.y }).toEqual({ x: 200, y: 200 })
  })

  /** A blob whose phone has gone is not really there, walls included. */
  it('leaves a blob whose phone has gone standing in one', () => {
    const state = room(1)
    const player = put(state, 'p1', 640, 360)
    applyMessage(state, { type: 'left', playerId: 'p1' })

    pushOutOfObstacles(state, [WALL], 1_000)

    expect({ x: player.x, y: player.y }).toEqual({ x: 640, y: 360 })
  })
})


/** A bar that slides up and down its own line. */
function bobbingBar(): Obstacle {
  return {
    id: 'bar',
    x: 400,
    y: 300,
    width: 40,
    height: 200,
    motion: { kind: 'bob', homeX: 400, homeY: 300, reachX: 0, reachY: 100, periodMs: 4_000, atMs: 0 },
  }
}

/**
 * Walls that move. The bar the race puts in the middle of its course is the
 * only thing in the game with an angle, and it is a real oriented box rather
 * than a row of little squares pretending to be a bar: the model is what the
 * e2e reads and what the TV draws, and the two must not disagree about where a
 * wall is.
 */
describe('a wall that moves', () => {
  it('comes back to where it started after a whole period', () => {
    const bar = bobbingBar()

    for (let step = 0; step < 40; step++) stepObstacles([bar], 100)

    expect(bar.x).toBeCloseTo(400, 6)
    expect(bar.y).toBeCloseTo(300, 6)
  })

  it('hangs at each end rather than turning round sharply', () => {
    const bar = bobbingBar()
    const travelled: number[] = []

    for (let step = 0; step < 40; step++) {
      stepObstacles([bar], 100)
      travelled.push(Math.abs(bar.drift?.dy ?? 0))
    }

    // A quarter of the way round is the far end: it is barely moving there,
    // and moving fastest through the middle. A sine is the whole of it.
    expect(Math.min(...travelled)).toBeLessThan(Math.max(...travelled) / 3)
  })

  it('never leaves its own line', () => {
    const bar = bobbingBar()

    for (let step = 0; step < 200; step++) {
      stepObstacles([bar], 50)
      expect(bar.x).toBe(400)
      expect(bar.y).toBeGreaterThanOrEqual(200 - 0.001)
      expect(bar.y).toBeLessThanOrEqual(400 + 0.001)
    }
  })

  it('turns steadily, and says how far it turned', () => {
    const bar: Obstacle = {
      id: 'turner',
      x: 400,
      y: 300,
      width: 40,
      height: 300,
      angle: 0,
      motion: { kind: 'spin', radiansPerSecond: 1 },
    }

    stepObstacles([bar], 500)

    expect(bar.angle).toBeCloseTo(0.5, 6)
    expect(bar.drift?.spin).toBeCloseTo(0.5, 6)
  })
})

describe('a wall that is turned', () => {
  /**
   * At every angle it can be at, and from every direction: the separation
   * works in the bar's own frame and turns the answer back out again.
   */
  it('puts a blob outside it, whichever way round it is', () => {
    for (let turn = 0; turn < 16; turn++) {
      const angle = (turn / 16) * Math.PI * 2
      const bar: Obstacle = { id: 'bar', x: 640, y: 360, width: 40, height: 300, angle }
      const state = room(1)
      const blob = state.players.get('p1') as Player

      for (let spot = 0; spot < 8; spot++) {
        const at = (spot / 8) * Math.PI * 2
        blob.x = 640 + Math.cos(at) * 40
        blob.y = 360 + Math.sin(at) * 40
        for (let frame = 0; frame < 60; frame++) pushOutOfObstacles(state, [bar], 50)
        expect(insideObstacle(bar, blob.x, blob.y)).toBe(false)
      }
    }
  })

  /** A blob standing where a turning bar sweeps is moved along, not through. */
  it('sweeps a blob along rather than leaving it inside', () => {
    const bar: Obstacle = {
      id: 'turner',
      x: 640,
      y: 360,
      width: 40,
      height: 400,
      angle: 0,
      motion: { kind: 'spin', radiansPerSecond: 0.8 },
    }
    const state = room(1)
    const blob = state.players.get('p1') as Player
    blob.x = 640
    blob.y = 360 - 150

    for (let frame = 0; frame < 40; frame++) {
      stepObstacles([bar], 50)
      pushOutOfObstacles(state, [bar], 50)
      // The first few frames are it being slid out of where it was standing,
      // which is deliberately not instant; after that it stays out.
      if (frame > 4) expect(insideObstacle(bar, blob.x, blob.y)).toBe(false)
    }

    // And it has been carried somewhere, rather than left where it stood.
    expect(Math.hypot(blob.x - 640, blob.y - (360 - 150))).toBeGreaterThan(20)
  })
})
