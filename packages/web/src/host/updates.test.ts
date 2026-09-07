import { describe, expect, it } from 'vitest'
import { isSafeToReload, shouldReload, VERSION_POLL_MS } from './updates.js'

/**
 * When the TV may take a new build. It is a much narrower moment than the
 * phone's, and deliberately so: a phone holds no game state and the host holds
 * all of it, so reloading the TV throws away every blob in the world along
 * with the picture each child drew on it.
 */

describe('when the TV may reload itself', () => {
  it('will, into an empty world', () => {
    expect(isSafeToReload(0)).toBe(true)
    expect(shouldReload(0, true)).toBe(true)
  })

  /**
   * One blob is one child's name, colour and drawing, and the relay mints a
   * fresh session behind a reloading TV — so everybody still attached comes
   * back as somebody new. Never for one blob, and never for nine.
   */
  it('will not, for any number of blobs at all', () => {
    for (let blobs = 1; blobs <= 10; blobs++) {
      expect(isSafeToReload(blobs)).toBe(false)
      expect(shouldReload(blobs, true)).toBe(false)
    }
  })

  /**
   * An away blob is still in the world — its child is fetching a drink and
   * their blob must be there when they get back — so `playerCount` counting it
   * is exactly right, and this says so: the count is the whole question.
   */
  it('counts a blob that is merely away as a blob to keep', () => {
    expect(isSafeToReload(1)).toBe(false)
  })

  it('does nothing at all until there is something to take', () => {
    expect(shouldReload(0, false)).toBe(false)
  })

  /**
   * Often enough that a TV switched on in the morning is current by the
   * evening, rare enough to be one small request. Nobody deploys this often.
   */
  it('asks often enough to notice a deploy, and no more', () => {
    expect(VERSION_POLL_MS).toBeGreaterThanOrEqual(30_000)
    expect(VERSION_POLL_MS).toBeLessThanOrEqual(600_000)
  })
})
