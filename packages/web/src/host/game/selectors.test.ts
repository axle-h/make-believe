import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { setPhase } from './phases.js'
import {
  activePlayers,
  currentPhase,
  playerById,
  playerCount,
  players,
  snapshot,
} from './selectors.js'
import { createGame } from './state.js'

function world() {
  const state = createGame()
  applyMessage(state, { type: 'join', playerId: 'p1', name: 'Wilf' })
  applyMessage(state, { type: 'join', playerId: 'p2', name: 'Ida' })
  applyMessage(state, { type: 'join', playerId: 'p3', name: 'Ted' })
  return state
}

describe('players', () => {
  it('lists everyone in slot order, however they joined', () => {
    const state = world()
    // p1 leaves and is forgotten, then a new phone takes the free slot 0.
    state.players.delete('p1')
    applyMessage(state, { type: 'join', playerId: 'p4', name: 'Nell' })

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

describe('currentPhase', () => {
  it('follows the world', () => {
    const state = createGame()
    expect(currentPhase(state)).toBe('lobby')
    setPhase(state, 'play')
    expect(currentPhase(state)).toBe('play')
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
    expect(taken.phase).toBe('lobby')
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
