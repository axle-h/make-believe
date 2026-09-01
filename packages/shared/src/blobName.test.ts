import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, isValidName, normaliseName } from './blobName.js'

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
  it('accepts a name from one character up to the cap', () => {
    expect(isValidName('W')).toBe(true)
    expect(isValidName('x'.repeat(MAX_NAME_LENGTH))).toBe(true)
    expect(isValidName('  Big Ted  ')).toBe(true)
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
