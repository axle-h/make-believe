import { describe, expect, it } from 'vitest'
import { applyMessage, noteSkinColour } from './apply.js'
import { BLOB_SIZE, BUBBLE_MS, PALETTE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js'
import { playerById } from './selectors.js'
import { createGame, nextFreeSlot, type GameState } from './state.js'
import { tick } from './tick.js'
import { joinPlayer } from './testRoom.js'

/** Everything a phone can send, as helpers. */
const join = (state: GameState, playerId: string, name: string) =>
  joinPlayer(state, playerId, name)
const input = (state: GameState, playerId: string, dx: number, dy: number) =>
  applyMessage(state, { type: 'input', playerId, dx, dy })
const left = (state: GameState, playerId: string) => applyMessage(state, { type: 'left', playerId })
const say = (state: GameState, playerId: string, value: string) =>
  applyMessage(state, { type: 'text', playerId, value })
const draw = (state: GameState, playerId: string, png: string) =>
  applyMessage(state, { type: 'drawing', playerId, png })
const finish = (state: GameState, playerId: string) =>
  applyMessage(state, { type: 'finish', playerId })
const png = (body: string) => `data:image/png;base64,${body}`
/** A hello that asks for one particular colour, the way a phone does. */
const ask = (state: GameState, playerId: string, name: string, colour: string) =>
  applyMessage(state, { type: 'join', playerId, name, colour })

/** The player a successful apply is about, or a failure if it did not apply. */
function playerOf(result: ReturnType<typeof applyMessage>) {
  if (!result.applied) {
    throw new Error(`expected the message to apply: ${JSON.stringify(result)}`)
  }
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

  it('takes the name off the hello, so a reconnect cannot rename anybody back', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    expect(playerOf(join(state, 'p1', 'Wilf')).name).toBe('Wilf')
    expect(state.players.size).toBe(1)
  })

  /** The floor is reused so that the room does not spread out forever. */
  it('reuses the place a leaver gave up', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    join(state, 'p2', 'Ida')
    state.players.delete('p1')

    expect(nextFreeSlot(state)).toBe(0)
    expect(playerOf(join(state, 'p3', 'Ted')).slot).toBe(0)
  })
})

/**
 * A colour is asked for, not handed out. The world grants it, says who has it,
 * or says there is no room — and the phone only ever shows what it was told.
 */
describe('asking for a colour', () => {
  it('grants the one asked for', () => {
    const state = createGame()

    expect(playerOf(ask(state, 'p1', 'Wilf', PALETTE[4] as string)).colour).toBe(PALETTE[4])
  })

  it('refuses one somebody is already wearing, and says which kind of no', () => {
    const state = createGame()
    ask(state, 'p1', 'Wilf', PALETTE[4] as string)

    expect(ask(state, 'p2', 'Ida', PALETTE[4] as string)).toEqual({
      applied: false,
      refused: 'colour',
      playerId: 'p2',
    })
    expect(state.players.size).toBe(1)
  })

  it('refuses a colour that is not a blob colour at all', () => {
    const state = createGame()

    expect(ask(state, 'p1', 'Wilf', '#123456')).toMatchObject({ refused: 'colour' })
  })

  /**
   * An away blob is still standing on the floor waiting for its phone. Giving
   * its colour away while it stood there would be giving its blob away.
   */
  it('keeps a colour for a blob whose phone has merely gone quiet', () => {
    const state = createGame()
    ask(state, 'p1', 'Wilf', PALETTE[4] as string)
    left(state, 'p1')

    expect(ask(state, 'p2', 'Ida', PALETTE[4] as string)).toMatchObject({ refused: 'colour' })
  })

  it('lets a colour go the moment its blob quits', () => {
    const state = createGame()
    ask(state, 'p1', 'Wilf', PALETTE[4] as string)
    finish(state, 'p1')

    expect(playerOf(ask(state, 'p2', 'Ida', PALETTE[4] as string)).colour).toBe(PALETTE[4])
  })

  /** A blob may not be refused its own colour: that is what a reconnect is. */
  it('lets a blob that is already here say hello again', () => {
    const state = createGame()
    const first = playerOf(ask(state, 'p1', 'Wilf', PALETTE[4] as string))
    left(state, 'p1')

    const again = playerOf(ask(state, 'p1', 'Wilf', PALETTE[4] as string))

    expect(again).toBe(first)
    expect(again.away).toBe(false)
  })

  it('refuses the eleventh blob, because there is no eleventh colour', () => {
    const state = createGame()
    for (const [index, colour] of PALETTE.entries()) ask(state, `p${index}`, `B${index}`, colour)

    expect(ask(state, 'extra', 'Ted', PALETTE[0] as string)).toMatchObject({ refused: 'full' })
    expect(state.players.size).toBe(PALETTE.length)
  })
})

/**
 * One blob per name, on the same terms as one blob per colour. Two blobs
 * called Ivy are two labels a child cannot tell apart.
 */
describe('asking for a name', () => {
  it('refuses a name somebody already has, whatever the case', () => {
    const state = createGame()
    ask(state, 'p1', 'Ivy', PALETTE[0] as string)

    expect(ask(state, 'p2', 'IVY', PALETTE[1] as string)).toEqual({
      applied: false,
      refused: 'name',
      playerId: 'p2',
    })
    expect(state.players.size).toBe(1)
  })

  /** A blob may not be refused its own label. */
  it('lets a blob keep the name it already has', () => {
    const state = createGame()
    ask(state, 'p1', 'Ivy', PALETTE[0] as string)

    expect(ask(state, 'p1', 'ivy', PALETTE[0] as string)).toMatchObject({ kind: 'rejoined' })
  })

  it('lets a name go the moment its blob quits', () => {
    const state = createGame()
    ask(state, 'p1', 'Ivy', PALETTE[0] as string)
    finish(state, 'p1')

    expect(playerOf(ask(state, 'p2', 'Ivy', PALETTE[1] as string)).name).toBe('Ivy')
  })
})

/**
 * Finishing is the one thing a phone can undo, and it undoes everything: the
 * blob, its name, its picture and its place. What comes back afterwards is
 * somebody new, which is the whole point of pressing it.
 */
describe('finish', () => {
  it('forgets the blob entirely, drawing and all', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    join(state, 'p2', 'Ida')
    draw(state, 'p1', png('AAAA'))
    say(state, 'p1', 'bye')

    const result = finish(state, 'p1')

    expect(result).toMatchObject({ applied: true, kind: 'finished' })
    expect(playerOf(result).name).toBe('Wilf')
    expect(playerById(state, 'p1')).toBeUndefined()
    expect(state.players.size).toBe(1)
  })

  it('leaves nothing behind for a later blob to inherit', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    join(state, 'p2', 'Ida')
    draw(state, 'p1', png('AAAA'))
    say(state, 'p1', 'bye')
    finish(state, 'p1')

    // The same phone, back with a new identity, as the player page mints one.
    // It may well pick the colour it just gave up — that is a child choosing,
    // and it is the picture and the name that had to go.
    const after = playerOf(join(state, 'p1-again', 'Ted'))
    expect(after.skin).toBeNull()
    expect(after.bubble).toBeNull()
    expect(after.name).toBe('Ted')
  })

  it('does not go on ticking, unlike a blob whose phone merely went quiet', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    join(state, 'p2', 'Ida')
    finish(state, 'p1')

    expect(tick(state, 100).removed).toEqual([])
    expect(state.players.size).toBe(1)
  })

  it('ignores somebody the world has never heard of', () => {
    const state = createGame()
    expect(finish(state, 'nobody')).toMatchObject({ applied: false, reason: 'unknown-player' })
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

    // Short of reaching them: a blob that ran into the other one would shove
    // it along, which is a collision rather than an input going astray.
    input(state, 'p1', 1, 0)
    tick(state, 100)

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
  /** A world with two blobs in it. There is nothing else to be ready for. */
  function playing() {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    join(state, 'p2', 'Ida')
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

  it('is welcome the moment a blob exists, and again straight after driving', () => {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    expect(say(state, 'p1', 'hello')).toMatchObject({ applied: true })

    input(state, 'p1', 1, 0)
    tick(state, 16)
    expect(say(state, 'p1', 'still here')).toMatchObject({ applied: true })
    expect(playerById(state, 'p1')?.bubble?.text).toBe('still here')
  })

  it('is ignored from a phone the world has not met', () => {
    const state = playing()
    expect(say(state, 'ghost', 'boo')).toEqual({ applied: false, reason: 'unknown-player' })
  })
})

describe('drawing', () => {
  function playing() {
    const state = createGame()
    join(state, 'p1', 'Wilf')
    return state
  }

  it('gives the blob a skin under a key of its own', () => {
    const state = playing()
    const result = draw(state, 'p1', png('AAAA'))

    expect(result).toMatchObject({ applied: true, kind: 'drawing' })
    expect(playerOf(result).skin).toEqual({ key: 'skin-p1-1', png: png('AAAA'), average: null })
  })

  it('changes the key when a second drawing arrives', () => {
    const state = playing()
    draw(state, 'p1', png('AAAA'))
    draw(state, 'p1', png('BBBB'))

    expect(playerById(state, 'p1')?.skin).toEqual({
      key: 'skin-p1-2',
      png: png('BBBB'),
      average: null,
    })
  })

  /**
   * The colour of a drawing comes back from whoever decoded it, a moment after
   * the drawing itself — and lands on the drawing it was read from, never on
   * whatever the blob happens to be wearing by then.
   */
  it('takes the colour of a drawing from the renderer that decoded it', () => {
    const state = playing()
    draw(state, 'p1', png('AAAA'))

    expect(noteSkinColour(state, 'p1', 'skin-p1-1', { r: 10, g: 200, b: 40 })).toBe(true)
    expect(playerById(state, 'p1')?.skin?.average).toEqual({ r: 10, g: 200, b: 40 })
  })

  it('drops the colour of a drawing that has already been redrawn', () => {
    const state = playing()
    draw(state, 'p1', png('AAAA'))
    draw(state, 'p1', png('BBBB'))

    expect(noteSkinColour(state, 'p1', 'skin-p1-1', { r: 10, g: 200, b: 40 })).toBe(false)
    expect(playerById(state, 'p1')?.skin?.average).toBeNull()
  })

  it('shrugs at a colour for a blob that has gone', () => {
    const state = playing()

    expect(noteSkinColour(state, 'ghost', 'skin-ghost-1', { r: 0, g: 0, b: 0 })).toBe(false)
  })

  it('keeps the skin when the phone goes away and comes back', () => {
    const state = playing()
    draw(state, 'p1', png('AAAA'))
    applyMessage(state, { type: 'left', playerId: 'p1' })
    join(state, 'p1', 'Wilf')

    expect(playerById(state, 'p1')?.skin?.key).toBe('skin-p1-1')
  })

  it('lets a blob be redrawn at any time, driving about or not', () => {
    const state = playing()
    draw(state, 'p1', png('AAAA'))
    input(state, 'p1', 1, 0)
    tick(state, 16)

    expect(draw(state, 'p1', png('CCCC'))).toMatchObject({ applied: true })
    expect(playerById(state, 'p1')?.skin?.key).toBe('skin-p1-2')
  })

  it('is ignored from a phone the world has not met', () => {
    const state = playing()
    expect(draw(state, 'ghost', png('AAAA'))).toEqual({ applied: false, reason: 'unknown-player' })
  })
})
