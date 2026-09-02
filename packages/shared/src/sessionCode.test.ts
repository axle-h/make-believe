import { describe, expect, it } from 'vitest'
import {
  SESSION_CODE_CHARSET,
  SESSION_CODE_LENGTH,
  generateSessionCode,
  isValidSessionCode,
} from './sessionCode.js'

describe('generateSessionCode', () => {
  it('is four characters from the charset', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateSessionCode()
      expect(code).toHaveLength(SESSION_CODE_LENGTH)
      expect([...code].every((char) => SESSION_CODE_CHARSET.includes(char))).toBe(true)
    }
  })

  it('uses the injected random source', () => {
    expect(generateSessionCode(() => 0)).toBe('AAAA')
  })

  /**
   * Nobody reads a session code any more, but the charset costs nothing to
   * keep legible and a code that turns up in a log is easier to follow for it.
   */
  it('never emits an ambiguous character', () => {
    expect(SESSION_CODE_CHARSET).not.toMatch(/[01OI]/)
  })
})

describe('isValidSessionCode', () => {
  it('accepts a generated code', () => {
    expect(isValidSessionCode(generateSessionCode())).toBe(true)
  })

  it('rejects the wrong length, lowercase, ambiguous characters and non-strings', () => {
    expect(isValidSessionCode('ABC')).toBe(false)
    expect(isValidSessionCode('ABCDE')).toBe(false)
    expect(isValidSessionCode('abcd')).toBe(false)
    expect(isValidSessionCode('AB0D')).toBe(false)
    expect(isValidSessionCode('AB-D')).toBe(false)
    expect(isValidSessionCode(undefined)).toBe(false)
    expect(isValidSessionCode(1234)).toBe(false)
  })
})
