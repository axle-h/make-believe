import { describe, expect, it } from 'vitest'
import { ASKABLE_PAINTS, PAINT_HEXES, PAINTS } from './paints.js'

describe('the paints', () => {
  it('are proper colours with names a child would use', () => {
    for (const paint of PAINTS) {
      expect(paint.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(paint.name).toMatch(/^[a-z]+$/)
    }
  })

  it('has no two the same', () => {
    expect(new Set(PAINT_HEXES).size).toBe(PAINTS.length)
    expect(new Set(PAINTS.map((paint) => paint.name)).size).toBe(PAINTS.length)
  })

  /** Whatever the TV asks a room to paint themselves, a phone must be able to make it. */
  it('only ever asks for something a phone can actually paint', () => {
    expect(ASKABLE_PAINTS.length).toBeGreaterThan(2)
    for (const paint of ASKABLE_PAINTS) expect(PAINTS).toContainEqual(paint)
  })
})
