import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { AWAY_TIMEOUT_MS, BLOB_SIZE, BUBBLE_MS, SPEED, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { nextFreeSlot, createGame, type GameState, type Player } from './state.js'
import { tick } from './tick.js'

function withPlayer(playerId = 'p1', name = 'Wilf'): { state: GameState; player: Player } {
  const state = createGame()
  const result = applyMessage(state, { type: 'join', playerId, name })
  if (!result.applied) throw new Error('join should apply')
  return { state, player: result.player }
}

describe('movement', () => {
  it('moves a blob by velocity times time', () => {
    const { state, player } = withPlayer()
    const startX = player.x
    applyMessage(state, { type: 'input', playerId: 'p1', dx: 0.5, dy: 0 })
    tick(state, 1000)

    expect(player.x).toBeCloseTo(startX + SPEED * 0.5, 5)
    expect(player.dy).toBe(0)
  })

  it('adds up over several steps as it would over several frames', () => {
    const { state, player } = withPlayer()
    const startX = player.x
    applyMessage(state, { type: 'input', playerId: 'p1', dx: 1, dy: 0 })
    for (let i = 0; i < 10; i++) tick(state, 16)

    expect(player.x).toBeCloseTo(startX + SPEED * 0.16, 5)
  })

  it('keeps a blob inside the world however hard it runs', () => {
    const { state, player } = withPlayer()
    applyMessage(state, { type: 'input', playerId: 'p1', dx: -1, dy: -1 })
    tick(state, 10_000)

    expect(player.x).toBe(BLOB_SIZE / 2)
    expect(player.y).toBe(BLOB_SIZE / 2)

    applyMessage(state, { type: 'input', playerId: 'p1', dx: 1, dy: 1 })
    tick(state, 10_000)

    expect(player.x).toBe(WORLD_WIDTH - BLOB_SIZE / 2)
    expect(player.y).toBe(WORLD_HEIGHT - BLOB_SIZE / 2)
  })

  it('leaves a still blob where it is', () => {
    const { state, player } = withPlayer()
    const spot = { x: player.x, y: player.y }
    tick(state, 1000)
    expect({ x: player.x, y: player.y }).toEqual(spot)
  })

  it('ignores a step that ran backwards', () => {
    const { state, player } = withPlayer()
    const spot = { x: player.x, y: player.y }
    applyMessage(state, { type: 'input', playerId: 'p1', dx: 1, dy: 0 })
    tick(state, -100)
    expect({ x: player.x, y: player.y }).toEqual(spot)
  })
})

describe('forgetting a phone that never came back', () => {
  it('forgets an away blob once the wait is up, and frees its slot', () => {
    const { state } = withPlayer()
    applyMessage(state, { type: 'join', playerId: 'p2', name: 'Ida' })
    applyMessage(state, { type: 'left', playerId: 'p1' })

    const result = tick(state, AWAY_TIMEOUT_MS)

    expect(result.removed).toEqual(['p1'])
    expect(state.players.has('p1')).toBe(false)
    expect(state.players.size).toBe(1)
    expect(nextFreeSlot(state)).toBe(0)
  })

  it('keeps it right up to the last moment', () => {
    const { state } = withPlayer()
    applyMessage(state, { type: 'left', playerId: 'p1' })
    expect(tick(state, AWAY_TIMEOUT_MS - 1).removed).toEqual([])
    expect(state.players.has('p1')).toBe(true)
  })

  it('never forgets a phone that is still there', () => {
    const { state } = withPlayer()
    tick(state, AWAY_TIMEOUT_MS * 3)
    expect(state.players.has('p1')).toBe(true)
  })

  it('gives a returning phone the full wait again', () => {
    const { state } = withPlayer()
    applyMessage(state, { type: 'left', playerId: 'p1' })
    tick(state, AWAY_TIMEOUT_MS - 1)
    applyMessage(state, { type: 'join', playerId: 'p1', name: 'Wilf' })
    applyMessage(state, { type: 'left', playerId: 'p1' })
    tick(state, AWAY_TIMEOUT_MS - 1)

    expect(state.players.has('p1')).toBe(true)
  })
})

describe('speech bubbles', () => {
  function talking() {
    const { state, player } = withPlayer()
    applyMessage(state, { type: 'text', playerId: 'p1', value: 'hello mum' })
    return { state, player }
  }

  it('counts a bubble down as the frames go by', () => {
    const { state, player } = talking()
    tick(state, 1000)
    expect(player.bubble).toEqual({ text: 'hello mum', remainingMs: BUBBLE_MS - 1000 })
  })

  it('takes the bubble down once its time is up', () => {
    const { state, player } = talking()
    tick(state, BUBBLE_MS - 1)
    expect(player.bubble).not.toBeNull()
    tick(state, 1)
    expect(player.bubble).toBeNull()
  })

  it('keeps a bubble up over a blob whose phone has gone', () => {
    const { state, player } = talking()
    applyMessage(state, { type: 'left', playerId: 'p1' })
    tick(state, 100)
    expect(player.bubble?.remainingMs).toBe(BUBBLE_MS - 100)
    tick(state, BUBBLE_MS)
    expect(player.bubble).toBeNull()
  })
})
