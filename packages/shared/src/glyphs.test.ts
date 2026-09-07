import { describe, expect, it } from 'vitest'
import { isSafeGlyph, SAFE_GLYPHS } from './glyphs.js'
import { SEQUENCES, THEMES, type Sequence } from './themes.js'

/**
 * The pictures, and the one rule about them: nothing newer than Emoji 5.0.
 *
 * The device is a stick behind a television running Android 9, which is Emoji
 * 11 — and 🪹, 🟡 and 🟢 were tofu boxes on it through a whole play test. A
 * list in a test only says a glyph is *allowed*; the debug panel draws the
 * whole list so that the television can say whether it renders.
 */

describe('the list itself', () => {
  it('has no two the same', () => {
    expect(new Set(SAFE_GLYPHS).size).toBe(SAFE_GLYPHS.length)
  })

  /**
   * A keycap is a digit, a variation selector and a combining enclosing
   * keycap rather than one character, and it renders inconsistently even where
   * every part of it exists. Plain digits are what the sequences use instead.
   */
  it('has no keycap sequences in it', () => {
    for (const glyph of SAFE_GLYPHS) expect(glyph).not.toContain('⃣')
  })

  it('says yes to everything on it and no to everything off it', () => {
    for (const glyph of SAFE_GLYPHS) expect(isSafeGlyph(glyph)).toBe(true)
    // 🪹 is Emoji 14, 🟢 is Emoji 12, 🧦 is Emoji 11: the three the third play
    // test actually saw come up as boxes.
    for (const glyph of ['🪹', '🟢', '🧦', '1️⃣']) expect(isSafeGlyph(glyph)).toBe(false)
  })

  /** A badge can be a run of one glyph — three hearts is three lives. */
  it('takes a run of the same picture', () => {
    expect(isSafeGlyph('♥♥♥')).toBe(true)
    expect(isSafeGlyph('')).toBe(false)
  })

  /** ✉️ is an envelope and a request to draw it in colour, not two pictures. */
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
    // Widened, because `as const` narrows a step with no picture to a type
    // that has no `glyph` at all.
    for (const sequence of SEQUENCES as readonly Sequence[]) {
      expect(isSafeGlyph(sequence.homeGlyph)).toBe(true)
      for (const step of sequence.steps) {
        if (step.glyph === undefined) continue
        expect(isSafeGlyph(step.glyph)).toBe(true)
      }
    }
  })
})
