import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { resolveCollisions } from './collisions.js'
import { BLOB_SIZE, WORLD_WIDTH } from './constants.js'
import { playerById } from './selectors.js'
import { createGame, type GameState, type Player } from './state.js'
import { tick } from './tick.js'

/** A world with the given blobs, placed exactly where the test wants them. */
function world(...spots: Array<{ id: string; x: number; y: number }>): GameState {
  const state = createGame()
  for (const spot of spots) {
    applyMessage(state, { type: 'join', playerId: spot.id, name: spot.id })
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
