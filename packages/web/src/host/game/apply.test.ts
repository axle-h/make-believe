import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { BLOB_SIZE, BUBBLE_MS, PALETTE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { setPhase } from './phases.js'
import { playerById } from './selectors.js'
import { createGame, nextFreeSlot, type GameState } from './state.js'
import { tick } from './tick.js'

/** The three messages a phone can send that phase 3 handles, as helpers. */
const join = (state: GameState, playerId: string, name: string) =>
  applyMessage(state, { type: 'join', playerId, name })
const input = (state: GameState, playerId: string, dx: number, dy: number) =>
  applyMessage(state, { type: 'input', playerId, dx, dy })
const left = (state: GameState, playerId: string) => applyMessage(state, { type: 'left', playerId })
const say = (state: GameState, playerId: string, value: string) =>
  applyMessage(state, { type: 'text', playerId, value })
const draw = (state: GameState, playerId: string, png: string) =>
  applyMessage(state, { type: 'drawing', playerId, png })
const png = (body: string) => `data:image/png;base64,${body}`

/** The player a successful apply is about, or a failure if it did not apply. */
function playerOf(result: ReturnType<typeof applyMessage>) {
  if (!result.applied) throw new Error(`expected the message to apply, got ${result.reason}`)
  return result.player
}

describe('join', () => {
  it('spawns inside the world with slot 0 and the first colour', () => {
    const state = createGame()
    const result = join(state, 'p1', 'Wilf')

    expect(result).toMatchObject({ applied: true, kind: 'joined' })
    const player = playerOf(result)
    expect(player).toMatchObject({ playerId: 'p1', name: 'Wilf', slot: 0, colour: PALETTE[0] })
    expect(player.x).toBeGreaterThan(BLOB_SIZE / 2)
    expect(player.x).toBeLessThan(WORLD_WIDTH - BLOB_SIZE / 2)
    expect(player.y).toBeGreaterThan(BLOB_SIZE / 2)
    expect(player.y).toBeLessThan(WORLD_HEIGHT - BLOB_SIZE / 2)
    expect(state.players.size).toBe(1)
  })

  it('gives each new player their own slot, colour and spot', () => {
    const state = createGame()
    const first = playerOf(join(state, 'p1', 'Wilf'))
    const second = playerOf(join(state, 'p2', 'Ida'))

    expect(second.slot).toBe(1)
    expect(second.colour).not.toBe(first.colour)
    expect({ x: second.x, y: second.y }).not.toEqual({ x: first.x, y: first.y })
    expect(state.players.size).toBe(2)
  })

  it('tidies up what a phone keyboard produced', () => {
    const state = createGame()
    expect(playerOf(join(state, 'p1', '  Big   Ted ')).name).toBe('Big Ted')
  })

  it('reattaches the same playerId to the same blob, keeping where it was', () => {
    const state = createGame()
    const before = playerOf(join(state, 'p1', 'Wilf'))
    join(state, 'p2', 'Ida')
    input(state, 'p1', 1, 0)
    tick(state, 500)
    const moved = { x: before.x, y: before.y }

    // The phone refreshed: same playerId, same name typed again.
    const result = join(state, 'p1', 'Wilf')

    expect(result).toMatchObject({ applied: true, kind: 'rejoined' })
    const after = playerOf(result)
    expect(state.players.size).toBe(2)
    expect(after.slot).toBe(before.slot)
    expect(after.colour).toBe(before.colour)
    expect({ x: after.x, y: after.y }).toEqual(moved)
  })

  it('takes a new name on a rejoin', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    expect(playerOf(join(state, 'p1', 'Big Ted')).name).toBe('Big Ted')
    expect(state.players.size).toBe(1)
  })

  it('reuses the slot a leaver gave up', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    join(state, 'p2', 'Ida')
    state.players.delete('p1')

    expect(nextFreeSlot(state)).toBe(0)
    expect(playerOf(join(state, 'p3', 'Ted')).colour).toBe(PALETTE[0])
  })
})

describe('input', () => {
  it('stores the vector on the player it came from', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    const result = input(state, 'p1', 0.5, -0.25)

    expect(result).toMatchObject({ applied: true, kind: 'input' })
    expect(playerOf(result)).toMatchObject({ dx: 0.5, dy: -0.25 })
  })

  it('moves only the blob it came from', () => {
    const state = createGame()
    const first = playerOf(join(state, 'p1', 'Wilf'))
    const second = playerOf(join(state, 'p2', 'Ida'))
    const stillSpot = { x: second.x, y: second.y }
    const movedFrom = first.x

    input(state, 'p1', 1, 0)
    tick(state, 500)

    expect(first.x).toBeGreaterThan(movedFrom)
    expect({ x: second.x, y: second.y }).toEqual(stillSpot)
  })

  it('is ignored, and changes nothing, from a phone the world has not met', () => {
    const state = createGame()
    expect(input(state, 'ghost', 1, 1)).toEqual({ applied: false, reason: 'unknown-player' })
    expect(state.players.size).toBe(0)
  })
})

describe('left', () => {
  it('keeps the blob, faded, holding its slot and its spot', () => {
    const state = createGame()
    const player = playerOf(join(state, 'p1', 'Wilf'))
    input(state, 'p1', 1, 0)
    tick(state, 500)
    const spot = { x: player.x, y: player.y }

    expect(left(state, 'p1')).toMatchObject({ applied: true, kind: 'away' })

    expect(state.players.size).toBe(1)
    expect(player.away).toBe(true)
    expect({ x: player.x, y: player.y }).toEqual(spot)
    expect(nextFreeSlot(state)).toBe(1)
  })

  it('stops the blob dead rather than letting it drift on its last input', () => {
    const state = createGame()
    const player = playerOf(join(state, 'p1', 'Wilf'))
    input(state, 'p1', 1, 1)
    left(state, 'p1')
    const spot = { x: player.x, y: player.y }
    tick(state, 1000)

    expect({ x: player.x, y: player.y }).toEqual(spot)
  })

  it('is ignored for a phone the world has not met', () => {
    const state = createGame()
    expect(left(state, 'ghost')).toEqual({ applied: false, reason: 'unknown-player' })
    expect(state.players.size).toBe(0)
  })
})

describe('a phone that comes back', () => {
  it('walks back into the same blob on a rejoin', () => {
    const state = createGame()
    const before = playerOf(join(state, 'p1', 'Wilf'))
    input(state, 'p1', 1, 0)
    tick(state, 500)
    const spot = { x: before.x, y: before.y }
    left(state, 'p1')
    tick(state, 1000)

    const after = playerOf(join(state, 'p1', 'Wilf'))

    expect(after.away).toBe(false)
    expect(after.slot).toBe(before.slot)
    expect(after.colour).toBe(before.colour)
    expect({ x: after.x, y: after.y }).toEqual(spot)
    expect(state.players.size).toBe(1)
  })

  it('drives again on a stray input, without waiting for another join', () => {
    const state = createGame()
    const player = playerOf(join(state, 'p1', 'Wilf'))
    left(state, 'p1')

    input(state, 'p1', 1, 0)

    expect(player.away).toBe(false)
    expect(player.awayForMs).toBe(0)
  })
})

describe('text', () => {
  /** A world with one player, in a phase where talking is allowed. */
  function playing() {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    join(state, 'p2', 'Ida')
    setPhase(state, 'play')
    return state
  }

  it('puts a bubble over the blob that said it', () => {
    const state = playing()
    const result = say(state, 'p1', 'hello mum')

    expect(result).toMatchObject({ applied: true, kind: 'text' })
    expect(playerOf(result).bubble).toEqual({ text: 'hello mum', remainingMs: BUBBLE_MS })
    expect(playerById(state, 'p2')?.bubble).toBeNull()
  })

  it('replaces the bubble rather than queueing a second one', () => {
    const state = playing()
    say(state, 'p1', 'first')
    tick(state, 1000)
    say(state, 'p1', 'second')

    expect(playerById(state, 'p1')?.bubble).toEqual({ text: 'second', remainingMs: BUBBLE_MS })
  })

  it('trims what a phone keyboard produced, and takes an empty message as hush', () => {
    const state = playing()
    say(state, 'p1', '  hello  ')
    expect(playerById(state, 'p1')?.bubble?.text).toBe('hello')

    say(state, 'p1', '   ')
    expect(playerById(state, 'p1')?.bubble).toBeNull()
  })

  it('is allowed during a text round as well as during play', () => {
    const state = playing()
    setPhase(state, 'text')
    expect(say(state, 'p1', 'in a round')).toMatchObject({ applied: true })
  })

  it('is ignored in the lobby, where there is nothing to talk over', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')

    expect(say(state, 'p1', 'anyone there')).toEqual({ applied: false, reason: 'wrong-phase' })
    expect(playerById(state, 'p1')?.bubble).toBeNull()
  })

  it('is ignored from a phone the world has not met', () => {
    const state = playing()
    expect(say(state, 'ghost', 'boo')).toEqual({ applied: false, reason: 'unknown-player' })
  })
})

describe('drawing', () => {
  function drawingRound() {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    setPhase(state, 'play')
    setPhase(state, 'draw')
    return state
  }

  it('gives the blob a skin under a key of its own', () => {
    const state = drawingRound()
    const result = draw(state, 'p1', png('AAAA'))

    expect(result).toMatchObject({ applied: true, kind: 'drawing' })
    expect(playerOf(result).skin).toEqual({ key: 'skin-p1-1', png: png('AAAA') })
  })

  it('changes the key when a second drawing arrives', () => {
    const state = drawingRound()
    draw(state, 'p1', png('AAAA'))
    draw(state, 'p1', png('BBBB'))

    expect(playerById(state, 'p1')?.skin).toEqual({ key: 'skin-p1-2', png: png('BBBB') })
  })

  it('keeps the skin when the phone goes away and comes back', () => {
    const state = drawingRound()
    draw(state, 'p1', png('AAAA'))
    applyMessage(state, { type: 'left', playerId: 'p1' })
    join(state, 'p1', 'Wilf')

    expect(playerById(state, 'p1')?.skin?.key).toBe('skin-p1-1')
  })

  it('is ignored in the lobby and from a phone the world has not met', () => {
    const lobby = createGame()
    join(lobby, 'p1', 'Wilf')
    expect(draw(lobby, 'p1', png('AAAA'))).toEqual({ applied: false, reason: 'wrong-phase' })

    const state = drawingRound()
    expect(draw(state, 'ghost', png('AAAA'))).toEqual({ applied: false, reason: 'unknown-player' })
  })
})
