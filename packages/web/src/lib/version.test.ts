import { describe, expect, it } from 'vitest'
import { isDifferentBuild } from './version.js'

/**
 * The same question on both pages: is the server serving something other than
 * what this page is running? A version is opaque, so "different" is the only
 * thing that can be asked of it — there is no newer or older.
 */
describe('comparing builds', () => {
  it('spots a deploy', () => {
    expect(isDifferentBuild('7fe4ccb', 'dbf9487')).toBe(true)
  })

  it('leaves a matching build alone', () => {
    expect(isDifferentBuild('7fe4ccb', '7fe4ccb')).toBe(false)
    // The server answers with a trailing newline often enough to be worth it.
    expect(isDifferentBuild('7fe4ccb', '7fe4ccb\n')).toBe(false)
  })

  it('will not reload anybody on an answer it does not have', () => {
    expect(isDifferentBuild('', 'dbf9487')).toBe(false)
    expect(isDifferentBuild('7fe4ccb', '')).toBe(false)
    expect(isDifferentBuild('7fe4ccb', '   ')).toBe(false)
  })

  /**
   * The one that would have reloaded a page for ever. `/version` is written by
   * a `generateBundle` hook, so it exists only in a real build — and the dev
   * server answers the path with the whole index page, 200 and `text/html`.
   * A page that took that for a version would decide a deploy had happened,
   * reload, and find the same thing again.
   */
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
    // A git SHA, short or long, and the millisecond clock it falls back to.
    expect(isDifferentBuild('7fe4ccb', 'dbf9487')).toBe(true)
    expect(isDifferentBuild('fb143983dd74d54dd91d87efbb1f392fcbde956f', '7fe4ccb')).toBe(true)
    expect(isDifferentBuild('1788774861000', '1788774862000')).toBe(true)
    expect(isDifferentBuild('1788774861000', '1788774861000')).toBe(false)
  })
})
