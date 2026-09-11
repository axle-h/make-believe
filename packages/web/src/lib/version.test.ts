import { describe, expect, it } from 'vitest'
import { isDifferentBuild } from './version.js'

describe('comparing builds', () => {
  it('spots a deploy', () => {
    expect(isDifferentBuild('7fe4ccb', 'dbf9487')).toBe(true)
  })

  it('leaves a matching build alone', () => {
    expect(isDifferentBuild('7fe4ccb', '7fe4ccb')).toBe(false)
    expect(isDifferentBuild('7fe4ccb', '7fe4ccb\n')).toBe(false)
  })

  it('will not reload anybody on an answer it does not have', () => {
    expect(isDifferentBuild('', 'dbf9487')).toBe(false)
    expect(isDifferentBuild('7fe4ccb', '')).toBe(false)
    expect(isDifferentBuild('7fe4ccb', '   ')).toBe(false)
  })

  /** The dev server answers `/version` with the index page, which is not a build. */
  it('will not take a page of HTML for a version', () => {
    const page = [
      '<!doctype html>',
      '<html lang="en-GB">',
      '  <head><title>MAKE believe</title></head>',
      '</html>',
    ].join('\n')

    expect(isDifferentBuild('7fe4ccb', page)).toBe(false)
    expect(isDifferentBuild(page, '7fe4ccb')).toBe(false)
  })

  it('takes the two things a version is ever made of', () => {
    expect(isDifferentBuild('7fe4ccb', 'dbf9487')).toBe(true)
    expect(isDifferentBuild('fb143983dd74d54dd91d87efbb1f392fcbde956f', '7fe4ccb')).toBe(true)
    expect(isDifferentBuild('1788774861000', '1788774862000')).toBe(true)
    expect(isDifferentBuild('1788774861000', '1788774861000')).toBe(false)
  })
})
