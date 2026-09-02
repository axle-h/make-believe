import { describe, expect, it } from 'vitest'
import { DRAWABLE_WORDS } from './words.js'

describe('things to draw', () => {
  it('has plenty of them, and no two the same', () => {
    expect(DRAWABLE_WORDS.length).toBeGreaterThan(30)
    expect(new Set(DRAWABLE_WORDS).size).toBe(DRAWABLE_WORDS.length)
  })

  /**
   * They are typed by a child on a phone and matched by the TV, so a word with
   * anything in it but letters and a single space would be a word somebody can
   * spell right and still be told they are wrong.
   */
  it('is all plain lower-case words, short enough to type in a hurry', () => {
    for (const word of DRAWABLE_WORDS) {
      expect(word).toMatch(/^[a-z]+( [a-z]+)?$/)
      expect(word.length).toBeLessThanOrEqual(12)
    }
  })
})
