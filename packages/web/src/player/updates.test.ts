import { describe, expect, it } from 'vitest'
import { isDifferentBuild, isSafeToReload, shouldReload } from './updates.js'

describe('when a new build may take over', () => {
  it('reloads where nobody is holding anything', () => {
    expect(shouldReload('scan', true)).toBe(true)
    expect(shouldReload('waiting', true)).toBe(true)
  })

  it('waits while a blob is being driven or named', () => {
    expect(shouldReload('play', true)).toBe(false)
    expect(shouldReload('join', true)).toBe(false)
  })

  it('does nothing at all with no update to take', () => {
    expect(shouldReload('scan', false)).toBe(false)
    expect(shouldReload('play', false)).toBe(false)
  })

  it('knows the safe screens on their own', () => {
    expect(isSafeToReload('waiting')).toBe(true)
    expect(isSafeToReload('play')).toBe(false)
  })
})

describe('comparing builds', () => {
  it('spots a deploy', () => {
    expect(isDifferentBuild('7fe4ccb', 'dbf9487')).toBe(true)
  })

  it('leaves a matching build alone', () => {
    expect(isDifferentBuild('7fe4ccb', '7fe4ccb')).toBe(false)
    // The server answers with a trailing newline often enough to be worth it.
    expect(isDifferentBuild('7fe4ccb', '7fe4ccb\n')).toBe(false)
  })

  it('will not reload on an answer it does not have', () => {
    expect(isDifferentBuild('', 'dbf9487')).toBe(false)
    expect(isDifferentBuild('7fe4ccb', '')).toBe(false)
    expect(isDifferentBuild('7fe4ccb', '   ')).toBe(false)
  })
})
