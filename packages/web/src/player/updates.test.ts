import { describe, expect, it } from 'vitest'
import { isSafeToReload, shouldReload } from './updates.js'

describe('when a new build may take over', () => {
  it('reloads where nobody is holding anything', () => {
    expect(shouldReload('waiting', true)).toBe(true)
  })

  it('waits while a blob is being driven or named', () => {
    expect(shouldReload('play', true)).toBe(false)
    expect(shouldReload('join', true)).toBe(false)
  })

  it('does nothing at all with no update to take', () => {
    expect(shouldReload('waiting', false)).toBe(false)
    expect(shouldReload('play', false)).toBe(false)
  })

  it('knows the safe screens on their own', () => {
    expect(isSafeToReload('waiting')).toBe(true)
    expect(isSafeToReload('play')).toBe(false)
  })
})

