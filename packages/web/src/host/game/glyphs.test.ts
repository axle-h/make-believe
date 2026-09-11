import { isSafeGlyph } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { CROWN_BADGE } from './constants.js'
import { FUZZY_BADGE, LIFE_BADGE, THROWN } from './objectives/dodge.js'
import { PENCIL } from './objectives/drawIt.js'
import { POTATO } from './objectives/hotPotato.js'
import { HOME_BADGE } from './objectives/race.js'

/** Every picture the host draws is in `SAFE_GLYPHS`, which caps the TV at Emoji 5.0 so nothing renders as tofu. */

describe('what the television is asked to draw', () => {
  it('is a safe picture, for everything thrown in dodge', () => {
    expect(THROWN.length).toBeGreaterThan(0)
    for (const thing of THROWN) expect(isSafeGlyph(thing.glyph)).toBe(true)
  })

  it('is a safe picture, for every badge worn beside a name', () => {
    for (const badge of [CROWN_BADGE, POTATO, PENCIL, HOME_BADGE, FUZZY_BADGE, LIFE_BADGE]) {
      expect(isSafeGlyph(badge)).toBe(true)
    }
  })

  it('is a safe picture for a whole row of lives', () => {
    expect(isSafeGlyph(LIFE_BADGE.repeat(3))).toBe(true)
  })
})
