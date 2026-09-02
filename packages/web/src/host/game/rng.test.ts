import { describe, expect, it } from 'vitest'
import { createRng, intRange, pick, pointInBounds, range } from './rng.js'

describe('createRng', () => {
  it('gives the same run twice from the same seed', () => {
    const a = createRng(1234)
    const b = createRng(1234)
    const runA = Array.from({ length: 20 }, () => a.next())
    const runB = Array.from({ length: 20 }, () => b.next())

    expect(runA).toEqual(runB)
  })

  it('gives a different run from a different seed', () => {
    const a = createRng(1)
    const b = createRng(2)

    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(
      Array.from({ length: 5 }, () => b.next()),
    )
  })

  it('stays inside [0, 1) and does not settle on one number', () => {
    const rng = createRng(99)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      seen.add(value)
    }

    expect(seen.size).toBeGreaterThan(490)
  })

  it('spreads itself roughly evenly across the range', () => {
    const rng = createRng(7)
    const buckets = [0, 0, 0, 0]
    for (let i = 0; i < 4000; i++) buckets[Math.floor(rng.next() * 4)]! += 1

    for (const count of buckets) expect(count).toBeGreaterThan(800)
  })
})

describe('range', () => {
  it('stays between its ends', () => {
    const rng = createRng(5)
    for (let i = 0; i < 200; i++) {
      const value = range(rng, 10, 20)
      expect(value).toBeGreaterThanOrEqual(10)
      expect(value).toBeLessThan(20)
    }
  })

  it('collapses to the one value when there is no room', () => {
    expect(range(createRng(1), 4, 4)).toBe(4)
  })
})

describe('intRange', () => {
  it('includes both ends and nothing outside them', () => {
    const rng = createRng(42)
    const seen = new Set<number>()
    for (let i = 0; i < 300; i++) seen.add(intRange(rng, 2, 4))

    // The spread is already a copy, so sorting it in place mutates nothing.
    // oxlint-disable-next-line unicorn/no-array-sort
    expect([...seen].sort()).toEqual([2, 3, 4])
  })
})

describe('pick', () => {
  it('only ever returns something from the list', () => {
    const rng = createRng(3)
    const items = ['a', 'b', 'c'] as const
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pick(rng, items))

    // The spread is already a copy, so sorting it in place mutates nothing.
    // oxlint-disable-next-line unicorn/no-array-sort
    expect([...seen].sort()).toEqual(['a', 'b', 'c'])
  })

  it('refuses an empty list rather than handing back nothing', () => {
    expect(() => pick(createRng(1), [])).toThrow()
  })
})

describe('pointInBounds', () => {
  it('keeps the margin away from every wall', () => {
    const rng = createRng(11)
    const bounds = { width: 1280, height: 720 }
    for (let i = 0; i < 300; i++) {
      const point = pointInBounds(rng, bounds, 120)
      expect(point.x).toBeGreaterThanOrEqual(120)
      expect(point.x).toBeLessThanOrEqual(1160)
      expect(point.y).toBeGreaterThanOrEqual(120)
      expect(point.y).toBeLessThanOrEqual(600)
    }
  })

  it('sits in the middle when the margin leaves no room at all', () => {
    const point = pointInBounds(createRng(1), { width: 200, height: 100 }, 500)

    expect(point).toEqual({ x: 100, y: 50 })
  })
})
