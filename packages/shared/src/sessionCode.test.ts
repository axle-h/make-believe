import { describe, expect, it } from 'vitest'
import {
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normaliseRoomCode,
} from './roomCode.js'

describe('generateRoomCode', () => {
  it('is four characters from the charset', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode()
      expect(code).toHaveLength(ROOM_CODE_LENGTH)
      expect([...code].every((char) => ROOM_CODE_CHARSET.includes(char))).toBe(true)
    }
  })

  it('uses the injected random source', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAA')
  })

  it('never emits an ambiguous character', () => {
    expect(ROOM_CODE_CHARSET).not.toMatch(/[01OI]/)
  })
})

describe('isValidRoomCode', () => {
  it('accepts a generated code', () => {
    expect(isValidRoomCode(generateRoomCode())).toBe(true)
  })

  it('rejects the wrong length, lowercase, ambiguous characters and non-strings', () => {
    expect(isValidRoomCode('ABC')).toBe(false)
    expect(isValidRoomCode('ABCDE')).toBe(false)
    expect(isValidRoomCode('abcd')).toBe(false)
    expect(isValidRoomCode('AB0D')).toBe(false)
    expect(isValidRoomCode('AB-D')).toBe(false)
    expect(isValidRoomCode(undefined)).toBe(false)
    expect(isValidRoomCode(1234)).toBe(false)
  })
})

describe('normaliseRoomCode', () => {
  it('trims and uppercases what a phone keyboard produced', () => {
    expect(normaliseRoomCode('  abcd ')).toBe('ABCD')
    expect(isValidRoomCode(normaliseRoomCode(' wxyz'))).toBe(true)
  })
})
