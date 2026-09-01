import { describe, expect, it } from 'vitest'
import { canEnterPhase, setPhase } from './phases.js'
import { createGame } from './state.js'

describe('a new world', () => {
  it('starts in the lobby', () => {
    expect(createGame().phase).toBe('lobby')
  })
})

describe('legal transitions', () => {
  it('lets the lobby start the game and the game go back', () => {
    const state = createGame()
    expect(setPhase(state, 'play')).toEqual({ changed: true, from: 'lobby', to: 'play' })
    expect(setPhase(state, 'lobby')).toEqual({ changed: true, from: 'play', to: 'lobby' })
  })

  it('drops into a round from the game and comes back', () => {
    const state = createGame()
    setPhase(state, 'play')
    expect(setPhase(state, 'text')).toEqual({ changed: true, from: 'play', to: 'text' })
    expect(setPhase(state, 'play')).toEqual({ changed: true, from: 'text', to: 'play' })
    expect(setPhase(state, 'draw')).toEqual({ changed: true, from: 'play', to: 'draw' })
    expect(setPhase(state, 'play')).toEqual({ changed: true, from: 'draw', to: 'play' })
  })

  it('lets a round be abandoned back to the lobby', () => {
    const state = createGame()
    setPhase(state, 'play')
    setPhase(state, 'draw')
    expect(setPhase(state, 'lobby')).toEqual({ changed: true, from: 'draw', to: 'lobby' })
  })
})

describe('illegal transitions', () => {
  it('will not jump from the lobby straight into a round', () => {
    const state = createGame()
    expect(setPhase(state, 'text')).toEqual({ changed: false, reason: 'illegal' })
    expect(setPhase(state, 'draw')).toEqual({ changed: false, reason: 'illegal' })
    expect(state.phase).toBe('lobby')
  })

  it('will not swap one round for another without passing through the game', () => {
    const state = createGame()
    setPhase(state, 'play')
    setPhase(state, 'text')
    expect(setPhase(state, 'draw')).toEqual({ changed: false, reason: 'illegal' })
    expect(state.phase).toBe('text')
  })

  it('says nothing happened when asked for the phase it is already in', () => {
    const state = createGame()
    expect(setPhase(state, 'lobby')).toEqual({ changed: false, reason: 'same-phase' })
    expect(state.phase).toBe('lobby')
  })
})

describe('canEnterPhase', () => {
  it('agrees with what setPhase does', () => {
    expect(canEnterPhase('lobby', 'play')).toBe(true)
    expect(canEnterPhase('lobby', 'draw')).toBe(false)
    expect(canEnterPhase('play', 'text')).toBe(true)
    expect(canEnterPhase('text', 'draw')).toBe(false)
  })
})
