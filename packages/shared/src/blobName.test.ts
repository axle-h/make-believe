import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, isValidName, normaliseName, sameName } from './blobName.js'

const bell = String.fromCodePoint(7)

describe('normaliseName', () => {
  it('trims and collapses what a phone keyboard produced', () => {
    expect(normaliseName('  Wilf  ')).toBe('Wilf')
    expect(normaliseName('Big   Ted')).toBe('Big Ted')
    expect(normaliseName('a\nb\tc')).toBe('a b c')
  })

  it('strips control characters', () => {
    expect(normaliseName(`Wi${bell}lf`)).toBe('Wi lf')
    expect(normaliseName(bell)).toBe('')
  })

  it('leaves an ordinary name, and an emoji, alone', () => {
    expect(normaliseName('Wilf')).toBe('Wilf')
    expect(normaliseName('Ted 🐻')).toBe('Ted 🐻')
  })

  it('does not truncate', () => {
    const long = 'x'.repeat(MAX_NAME_LENGTH + 5)
    expect(normaliseName(long)).toHaveLength(MAX_NAME_LENGTH + 5)
  })
})

describe('isValidName', () => {
  it('caps a name at five characters, so it never outgrows the blob under it', () => {
    expect(MAX_NAME_LENGTH).toBe(5)
  })

  it('accepts a name from one character up to the cap', () => {
    expect(isValidName('W')).toBe(true)
    expect(isValidName('x'.repeat(MAX_NAME_LENGTH))).toBe(true)
    expect(isValidName('  Ted  ')).toBe(true)
  })

  it('rejects empty, whitespace-only, control-only, oversize and non-strings', () => {
    expect(isValidName('')).toBe(false)
    expect(isValidName('   ')).toBe(false)
    expect(isValidName(bell)).toBe(false)
    expect(isValidName('x'.repeat(MAX_NAME_LENGTH + 1))).toBe(false)
    expect(isValidName(undefined)).toBe(false)
    expect(isValidName(42)).toBe(false)
  })
})

/**
 * One blob per name. "IVY" and "ivy" are one label on a TV, so the world
 * refuses the second — and both ends share this so that a join screen can be
 * right about it while a child is still typing.
 */
describe('sameName', () => {
  it('is the same name whatever the case', () => {
    expect(sameName('Ivy', 'ivy')).toBe(true)
    expect(sameName('IVY', 'iVy')).toBe(true)
  })

  it('is the same name whatever the whitespace around it', () => {
    expect(sameName('  Ivy ', 'Ivy')).toBe(true)
    expect(sameName('I  vy', 'I vy')).toBe(true)
  })

  it('is not the same name when it is a different name', () => {
    expect(sameName('Ivy', 'Ida')).toBe(false)
    expect(sameName('Ivy', '')).toBe(false)
  })
})
