import { describe, expect, it } from 'vitest'
import { isSafeGlyph, SAFE_GLYPHS } from './glyphs.js'
import { SEQUENCES, THEMES, type Sequence } from './themes.js'

// Nothing newer than Emoji 5.0. These say a glyph is allowed; only the TV can say it renders.

describe('the list itself', () => {
  it('has no two the same', () => {
    expect(new Set(SAFE_GLYPHS).size).toBe(SAFE_GLYPHS.length)
  })

  it('has no keycap sequences in it', () => {
    for (const glyph of SAFE_GLYPHS) expect(glyph).not.toContain('⃣')
  })

  it('says yes to everything on it and no to everything off it', () => {
    for (const glyph of SAFE_GLYPHS) expect(isSafeGlyph(glyph)).toBe(true)
    // 🪹 is Emoji 14 and 🟢 is Emoji 12; 🧦 is 5.0 but still came up a box on the TV.
    for (const glyph of ['🪹', '🟢', '🧦', '1️⃣']) expect(isSafeGlyph(glyph)).toBe(false)
  })

  it('takes a run of the same picture', () => {
    expect(isSafeGlyph('♥♥♥')).toBe(true)
    expect(isSafeGlyph('')).toBe(false)
  })

  it('keeps a variation selector with the picture in front of it', () => {
    expect(isSafeGlyph('✉️')).toBe(true)
    expect(isSafeGlyph('🗑️')).toBe(true)
  })
})

describe('everything the game draws', () => {
  it('is a picture the television has heard of, in every theme', () => {
    for (const theme of THEMES) {
      expect(isSafeGlyph(theme.glyph)).toBe(true)
      expect(isSafeGlyph(theme.homeGlyph)).toBe(true)
    }
  })

  it('is a picture the television has heard of, in every sequence', () => {
    // Widened: `as const` narrows a step with no picture to a type with no `glyph` at all.
    for (const sequence of SEQUENCES as readonly Sequence[]) {
      expect(isSafeGlyph(sequence.homeGlyph)).toBe(true)
      for (const step of sequence.steps) {
        if (step.glyph === undefined) continue
        expect(isSafeGlyph(step.glyph)).toBe(true)
      }
    }
  })
})
