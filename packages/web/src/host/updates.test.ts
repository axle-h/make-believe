import { describe, expect, it } from 'vitest'
import { isSafeToReload, shouldReload, VERSION_POLL_MS } from './updates.js'

describe('when the TV may reload itself', () => {
  it('will, into an empty world', () => {
    expect(isSafeToReload(0)).toBe(true)
    expect(shouldReload(0, true)).toBe(true)
  })

  it('will not, for any number of blobs at all', () => {
    for (let blobs = 1; blobs <= 10; blobs++) {
      expect(isSafeToReload(blobs)).toBe(false)
      expect(shouldReload(blobs, true)).toBe(false)
    }
  })

  /** The caller passes `playerCount`, which includes away blobs. */
  it('counts a blob that is merely away as a blob to keep', () => {
    expect(isSafeToReload(1)).toBe(false)
  })

  it('does nothing at all until there is something to take', () => {
    expect(shouldReload(0, false)).toBe(false)
  })

  it('asks often enough to notice a deploy, and no more', () => {
    expect(VERSION_POLL_MS).toBeGreaterThanOrEqual(30_000)
    expect(VERSION_POLL_MS).toBeLessThanOrEqual(600_000)
  })
})
