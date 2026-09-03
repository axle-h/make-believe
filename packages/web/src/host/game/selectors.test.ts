import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { BLOB_COLOURS } from './constants.js'
import {
  activePlayers,
  palette,
  playerById,
  playerCount,
  players,
  snapshot,
} from './selectors.js'
import { createGame } from './state.js'
import { joinPlayer } from './testRoom.js'

function world() {
  const state = createGame()
  joinPlayer(state, 'p1', 'Wilf')
  joinPlayer(state, 'p2', 'Ida')
  joinPlayer(state, 'p3', 'Ted')
  return state
}

describe('players', () => {
  it('lists everyone in slot order, however they joined', () => {
    const state = world()
    // p1 leaves and is forgotten, then a new phone takes the free slot 0.
    state.players.delete('p1')
    joinPlayer(state, 'p4', 'Nell')

    expect(players(state).map((player) => player.playerId)).toEqual(['p4', 'p2', 'p3'])
    expect(playerCount(state)).toBe(3)
  })

  it('finds a player by id, and nobody by a stranger', () => {
    const state = world()
    expect(playerById(state, 'p2')?.name).toBe('Ida')
    expect(playerById(state, 'ghost')).toBeUndefined()
  })

  it('leaves an away blob out of the active list but keeps it in the full one', () => {
    const state = world()
    applyMessage(state, { type: 'left', playerId: 'p2' })

    expect(activePlayers(state).map((player) => player.playerId)).toEqual(['p1', 'p3'])
    expect(players(state)).toHaveLength(3)
  })
})

describe('snapshot', () => {
  it('is plain data that survives leaving the page', () => {
    const state = world()
    applyMessage(state, { type: 'input', playerId: 'p1', dx: 1, dy: 0 })
    applyMessage(state, { type: 'left', playerId: 'p3' })

    const taken = snapshot(state)

    expect(JSON.parse(JSON.stringify(taken))).toEqual(taken)
    expect(taken.world).toEqual({ width: 1280, height: 720 })
    expect(taken.players.map((player) => player.name)).toEqual(['Wilf', 'Ida', 'Ted'])
    expect(taken.players[0]).toMatchObject({ dx: 1, dy: 0, away: false, text: null, skinKey: null })
    expect(taken.players[2]).toMatchObject({ away: true })
  })

  it('does not hand out the live world', () => {
    const state = world()
    const taken = snapshot(state)
    const first = taken.players[0]
    if (!first) throw new Error('expected a player')
    first.x = -1

    expect(playerById(state, 'p1')?.x).not.toBe(-1)
  })
})

/**
 * What a join screen is made of. The phone draws exactly this: which colours
 * there are, what to call them, and who has one.
 */
describe('the palette', () => {
  it('lists every colour there is, with the name of whoever has it', () => {
    const state = createGame()
    const wilf = joinPlayer(state, 'p1', 'Wilf')
    const taken = wilf.applied ? wilf.player.colour : ''

    const swatches = palette(state)

    expect(swatches).toHaveLength(BLOB_COLOURS.length)
    expect(swatches.find((swatch) => swatch.hex === taken)?.takenBy).toBe('Wilf')
    expect(swatches.filter((swatch) => swatch.takenBy !== null)).toHaveLength(1)
    for (const swatch of swatches) expect(swatch.name.length).toBeGreaterThan(0)
  })

  /** An away blob is still on the floor, so its colour is not going spare. */
  it('keeps a colour for a blob whose phone has gone quiet, and frees one that quits', () => {
    const state = world()
    applyMessage(state, { type: 'left', playerId: 'p1' })

    expect(palette(state).filter((swatch) => swatch.takenBy !== null)).toHaveLength(3)

    applyMessage(state, { type: 'finish', playerId: 'p1' })

    expect(palette(state).filter((swatch) => swatch.takenBy !== null)).toHaveLength(2)
  })
})
