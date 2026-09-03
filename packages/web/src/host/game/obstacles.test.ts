import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { BLOB_SIZE } from './constants.js'
import { insideObstacle, pushOutOfObstacles, PUSH_OUT_SPEED, type Obstacle } from './obstacles.js'
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
