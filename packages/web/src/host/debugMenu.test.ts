import { describe, expect, it } from 'vitest'
import { debugKey } from './debugMenu.js'

describe('a closed debug menu', () => {
  it('opens on d and answers to nothing else at all', () => {
    expect(debugKey('d', false, 0, 12)).toEqual({ kind: 'open' })
    for (const key of ['Enter', 'Escape', 'ArrowDown', ' ', 'a', 'D', '1']) {
      expect(debugKey(key, false, 0, 12)).toEqual({ kind: 'none' })
    }
  })
})

describe('an open debug menu', () => {
  it('closes on d and on Escape', () => {
    expect(debugKey('d', true, 3, 12)).toEqual({ kind: 'close' })
    expect(debugKey('Escape', true, 3, 12)).toEqual({ kind: 'close' })
  })

  it('walks the list', () => {
    expect(debugKey('ArrowDown', true, 3, 12)).toEqual({ kind: 'move', index: 4 })
    expect(debugKey('ArrowUp', true, 3, 12)).toEqual({ kind: 'move', index: 2 })
  })

  /** Twelve presses of Down to reach the last one is a key that looks broken. */
  it('wraps round both ends of the list', () => {
    expect(debugKey('ArrowDown', true, 11, 12)).toEqual({ kind: 'move', index: 0 })
    expect(debugKey('ArrowUp', true, 0, 12)).toEqual({ kind: 'move', index: 11 })
  })

  it('stays put when there is nothing to choose from', () => {
    expect(debugKey('ArrowDown', true, 0, 0)).toEqual({ kind: 'move', index: 0 })
  })

  it('starts whatever is highlighted', () => {
    expect(debugKey('Enter', true, 5, 12)).toEqual({ kind: 'choose', index: 5 })
    expect(debugKey(' ', true, 5, 12)).toEqual({ kind: 'choose', index: 5 })
  })

  it('nudges the ladder either way', () => {
    for (const key of ['ArrowRight', '+', '=']) {
      expect(debugKey(key, true, 0, 12)).toEqual({ kind: 'level', by: 1 })
    }
    for (const key of ['ArrowLeft', '-', '_']) {
      expect(debugKey(key, true, 0, 12)).toEqual({ kind: 'level', by: -1 })
    }
  })

  it('lets everything else past', () => {
    expect(debugKey('q', true, 0, 12)).toEqual({ kind: 'none' })
    expect(debugKey('Tab', true, 0, 12)).toEqual({ kind: 'none' })
  })
})
