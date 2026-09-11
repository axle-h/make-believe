import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { AWAY_TIMEOUT_MS, BLOB_SIZE, BUBBLE_MS, SPEED, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { nextFreeSlot, createGame, type GameState, type Player } from './state.js'
import { tick } from './tick.js'
import { joinPlayer } from './testRoom.js'

function withPlayer(playerId = 'p1', name = 'Wilf'): { state: GameState; player: Player } {
  const state = createGame()
  const result = joinPlayer(state, playerId, name)
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
    joinPlayer(state, 'p2', 'Ida')
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
    joinPlayer(state, 'p1', 'Wilf')
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

/** Every bounce in one step, whoever it was for. */
const bouncesIn = (result: ReturnType<typeof tick>) =>
  result.sounds.filter((sound) => sound.cue === 'bounce')

/** A room where nobody is near anybody, so a test can place them itself. */
function scattered(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    const player = joinPlayer(state, `p${index}`, `B${index}`)
    if (!player.applied) throw new Error('join should apply')
    player.player.x = 200 + index * BLOB_SIZE * 4
    player.player.y = 200
  }
  return state
}

/** A bounce is an edge, not a state: one noise per contact, worked out from what changed. */
describe('bouncing off things', () => {
  it('says nothing at all while everybody is driving about in the open', () => {
    const state = scattered(2)
    applyMessage(state, { type: 'input', playerId: 'p1', dx: 0, dy: 1 })

    expect(bouncesIn(tick(state, 16))).toEqual([])
  })

  it('makes exactly one noise when two blobs drive into each other', () => {
    const state = scattered(2)
    const one = state.players.get('p1')!
    const other = state.players.get('p2')!
    other.x = one.x + BLOB_SIZE - 4
    other.y = one.y

    const first = bouncesIn(tick(state, 16))
    // And not one a frame after it: they are still touching, and still quiet.
    const rest = [tick(state, 16), tick(state, 16)].flatMap((step) => bouncesIn(step))

    // `map` is already a fresh array, so sorting it mutates nothing.
    // oxlint-disable-next-line unicorn/no-array-sort
    expect(first.map((sound) => sound.to).sort()).toEqual(['p1', 'p2'])
    expect(rest).toEqual([])
  })

  it('makes a second when they come apart and touch again', () => {
    const state = scattered(2)
    const one = state.players.get('p1')!
    const other = state.players.get('p2')!
    other.x = one.x + BLOB_SIZE - 4
    other.y = one.y
    expect(bouncesIn(tick(state, 16))).not.toEqual([])

    other.x = one.x + BLOB_SIZE * 6
    // Far apart for a moment — long enough to clear the bounce limiter too.
    for (let frame = 0; frame < 20; frame++) tick(state, 16)
    other.x = one.x + BLOB_SIZE - 4

    expect(bouncesIn(tick(state, 16))).not.toEqual([])
  })

  it('makes one noise for a blob held against the edge of the floor, then none', () => {
    const state = scattered(1)
    applyMessage(state, { type: 'input', playerId: 'p1', dx: -1, dy: 0 })
    // The bounce is the moment it stops, not every frame it leans there.
    let heard = 0
    for (let frame = 0; frame < 200; frame++) heard += bouncesIn(tick(state, 16)).length

    expect(heard).toBe(1)
    expect(state.players.get('p1')?.x).toBe(BLOB_SIZE / 2)
  })

  it('bounces a blob a wall has appeared on top of', () => {
    // Two, since the world asks nothing of a room of one and a wall needs a running task.
    const state = scattered(2)
    tick(state, 16)
    const blob = state.players.get('p1')!
    const objective = state.objectives.current
    if (!objective) throw new Error('expected the world to be asking for something')
    objective.obstacles = [{ id: 'wall', x: blob.x, y: blob.y, width: 120, height: 120 }]

    expect(bouncesIn(tick(state, 16)).map((sound) => sound.to)).toEqual(['p1'])
  })

  /** An away blob is a ghost: it collides with nothing, so it bounces off nothing. */
  it('never bounces a blob whose phone has gone', () => {
    const state = scattered(2)
    const one = state.players.get('p1')!
    const other = state.players.get('p2')!
    other.x = one.x + BLOB_SIZE - 4
    other.y = one.y
    applyMessage(state, { type: 'left', playerId: 'p2' })

    expect(bouncesIn(tick(state, 16))).toEqual([])
  })

  /** Bounces have their own budget, so scraping a wall cannot starve a delivery cue. */
  it('lets a bounce and a real cue through in the same step', () => {
    const state = scattered(2)
    const one = state.players.get('p1')!
    const other = state.players.get('p2')!
    other.x = one.x + BLOB_SIZE - 4
    other.y = one.y
    state.objectives.sounds.push({ to: 'p1', cue: 'deliver' })

    const heard = tick(state, 16).sounds.filter((sound) => sound.to === 'p1')

    // oxlint-disable-next-line unicorn/no-array-sort
    expect(heard.map((sound) => sound.cue).sort()).toEqual(['bounce', 'deliver'])
  })
})
