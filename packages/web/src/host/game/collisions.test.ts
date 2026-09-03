import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { barge, nearestTouching, resolveCollisions, touching } from './collisions.js'
import { BLOB_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { playerById } from './selectors.js'
import { createGame, type GameState, type Player } from './state.js'
import { tick } from './tick.js'
import { joinPlayer } from './testRoom.js'

/** A world with the given blobs, placed exactly where the test wants them. */
function world(...spots: Array<{ id: string; x: number; y: number }>): GameState {
  const state = createGame()
  for (const spot of spots) {
    joinPlayer(state, spot.id, spot.id)
    const player = playerById(state, spot.id)
    if (!player) throw new Error('join should apply')
    player.x = spot.x
    player.y = spot.y
  }
  return state
}

function at(state: GameState, id: string): Player {
  const player = playerById(state, id)
  if (!player) throw new Error(`no blob ${id}`)
  return player
}

/** True if two blobs are standing inside one another, give or take a rounding. */
function overlapping(a: Player, b: Player): boolean {
  const slack = 1e-9
  return Math.abs(a.x - b.x) < BLOB_SIZE - slack && Math.abs(a.y - b.y) < BLOB_SIZE - slack
}

describe('resolveCollisions', () => {
  it('leaves blobs that are not touching alone', () => {
    const state = world({ id: 'a', x: 200, y: 300 }, { id: 'b', x: 400, y: 300 })
    resolveCollisions(state)

    expect(at(state, 'a').x).toBe(200)
    expect(at(state, 'b').x).toBe(400)
  })

  it('pushes an overlapping pair apart, half each, along the shallower axis', () => {
    // 40 apart across, 300 down: they overlap by 32 horizontally.
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 340, y: 300 })
    resolveCollisions(state)

    expect(at(state, 'a').x).toBe(284)
    expect(at(state, 'b').x).toBe(356)
    expect(at(state, 'a').y).toBe(300)
    expect(overlapping(at(state, 'a'), at(state, 'b'))).toBe(false)
  })

  it('pushes vertically when that is the shallower way out', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 290, y: 350 })
    resolveCollisions(state)

    expect(at(state, 'a').y).toBeLessThan(300)
    expect(at(state, 'b').y).toBeGreaterThan(350)
    expect(at(state, 'a').x).toBe(300)
    expect(overlapping(at(state, 'a'), at(state, 'b'))).toBe(false)
  })

  it('separates two blobs standing exactly on top of each other', () => {
    const state = world({ id: 'a', x: 400, y: 300 }, { id: 'b', x: 400, y: 300 })
    resolveCollisions(state)

    expect(overlapping(at(state, 'a'), at(state, 'b'))).toBe(false)
  })

  it('never pushes anyone through a wall, and still separates them there', () => {
    const half = BLOB_SIZE / 2
    const state = world({ id: 'a', x: half, y: 300 }, { id: 'b', x: half + 20, y: 300 })
    resolveCollisions(state)

    expect(at(state, 'a').x).toBe(half)
    expect(at(state, 'b').x).toBeGreaterThanOrEqual(half + BLOB_SIZE)
    expect(overlapping(at(state, 'a'), at(state, 'b'))).toBe(false)
  })

  it('sorts out a squash of three', () => {
    const state = world(
      { id: 'a', x: 600, y: 300 },
      { id: 'b', x: 620, y: 310 },
      { id: 'c', x: 640, y: 290 },
    )
    resolveCollisions(state)

    expect(overlapping(at(state, 'a'), at(state, 'b'))).toBe(false)
    expect(overlapping(at(state, 'b'), at(state, 'c'))).toBe(false)
    expect(overlapping(at(state, 'a'), at(state, 'c'))).toBe(false)
  })

  it('walks straight through a blob whose phone has gone', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'ghost', x: 320, y: 300 })
    applyMessage(state, { type: 'left', playerId: 'ghost' })

    resolveCollisions(state)

    expect(at(state, 'a').x).toBe(300)
    expect(at(state, 'ghost').x).toBe(320)
  })
})

describe('driving into somebody', () => {
  it('shoves them along rather than sliding through them', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 400, y: 300 })
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 0 })

    for (let frame = 0; frame < 30; frame++) tick(state, 16)

    const a = at(state, 'a')
    const b = at(state, 'b')
    expect(a.x).toBeGreaterThan(300)
    expect(b.x).toBeGreaterThan(400)
    expect(b.x - a.x).toBeCloseTo(BLOB_SIZE, 5)
  })

  it('cannot shove anyone out of the world', () => {
    const state = world(
      { id: 'a', x: WORLD_WIDTH - 200, y: 300 },
      { id: 'b', x: WORLD_WIDTH - 120, y: 300 },
    )
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 0 })

    for (let frame = 0; frame < 120; frame++) tick(state, 16)

    expect(at(state, 'b').x).toBe(WORLD_WIDTH - BLOB_SIZE / 2)
    expect(overlapping(at(state, 'a'), at(state, 'b'))).toBe(false)
  })
})

describe('touching', () => {
  it('counts a blob sitting edge to edge, which is where separation leaves them', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 300 + BLOB_SIZE, y: 300 })

    expect(touching(at(state, 'a'), at(state, 'b'))).toBe(true)
  })

  it('does not count a blob a blob and a half away', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 300 + BLOB_SIZE * 1.5, y: 300 })

    expect(touching(at(state, 'a'), at(state, 'b'))).toBe(false)
  })
})

describe('nearestTouching', () => {
  it('finds the blob actually driven into, not whichever comes first', () => {
    const state = world(
      { id: 'a', x: 300, y: 300 },
      { id: 'far', x: 300, y: 300 + BLOB_SIZE },
      { id: 'near', x: 300 + BLOB_SIZE * 0.9, y: 300 },
    )

    expect(nearestTouching(at(state, 'a'), [at(state, 'far'), at(state, 'near')])?.playerId).toBe(
      'near',
    )
  })

  it('never finds itself, and finds nobody in an empty room', () => {
    const state = world({ id: 'a', x: 300, y: 300 })

    expect(nearestTouching(at(state, 'a'), [at(state, 'a')])).toBeNull()
  })
})

/**
 * The shove a task can ask for on top of separation. It is opt-in, so these
 * call it directly: `tick` never does, and nothing outside sumo should.
 */
describe('barge', () => {
  it('sends the blob being driven into skidding further than it was in the way', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 300 + BLOB_SIZE, y: 300 })
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 0 })

    barge(state, 200, 100)

    expect(at(state, 'b').x).toBeCloseTo(300 + BLOB_SIZE + 20, 5)
    // Whoever is doing the shoving stays exactly where their own driving put
    // them: the push is something they give, not something they take.
    expect(at(state, 'a').x).toBe(300)
  })

  it('does nothing at all for two blobs leaning on each other equally', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 300 + BLOB_SIZE, y: 300 })
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 0 })
    applyMessage(state, { type: 'input', playerId: 'b', dx: -1, dy: 0 })

    barge(state, 200, 100)

    expect(at(state, 'a').x).toBe(300)
    expect(at(state, 'b').x).toBe(300 + BLOB_SIZE)
  })

  it('leaves blobs that are nowhere near each other alone', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 700, y: 300 })
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 0 })

    barge(state, 200, 100)

    expect(at(state, 'b').x).toBe(700)
  })

  it('shoves along the line between them, so a corner nudge goes diagonally', () => {
    const state = world(
      { id: 'a', x: 300, y: 300 },
      { id: 'b', x: 300 + BLOB_SIZE, y: 300 + BLOB_SIZE },
    )
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 1 })

    barge(state, 200, 100)

    const b = at(state, 'b')
    expect(b.x).toBeGreaterThan(300 + BLOB_SIZE)
    expect(b.y - (300 + BLOB_SIZE)).toBeCloseTo(b.x - (300 + BLOB_SIZE), 5)
  })

  it('cannot shove anybody off the floor', () => {
    const state = world(
      { id: 'a', x: WORLD_WIDTH - 200, y: WORLD_HEIGHT - 200 },
      { id: 'b', x: WORLD_WIDTH - 200 + BLOB_SIZE, y: WORLD_HEIGHT - 200 },
    )
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 0 })

    for (let frame = 0; frame < 200; frame++) {
      // A shove is on top of driving, not instead of it: `tick` is what moves
      // the blob doing the shoving, so this stands in for it.
      const a = at(state, 'a')
      a.x = Math.min(WORLD_WIDTH - BLOB_SIZE / 2, a.x + 8)
      barge(state, 400, 16)
    }

    expect(at(state, 'b').x).toBe(WORLD_WIDTH - BLOB_SIZE / 2)
  })

  it('is not something a blob whose phone has gone can do or have done to it', () => {
    const state = world({ id: 'a', x: 300, y: 300 }, { id: 'b', x: 300 + BLOB_SIZE, y: 300 })
    applyMessage(state, { type: 'input', playerId: 'a', dx: 1, dy: 0 })
    applyMessage(state, { type: 'left', playerId: 'b' })

    barge(state, 200, 100)

    expect(at(state, 'b').x).toBe(300 + BLOB_SIZE)
  })
})
