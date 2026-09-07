import { describe, expect, it } from 'vitest'
import { PAINT_HEXES, PAINTS } from './paints.js'

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
})
