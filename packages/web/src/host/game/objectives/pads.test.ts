import { describe, expect, it } from 'vitest'
import { WORLD_HEIGHT, WORLD_WIDTH, ZONE_COLOURS } from '../constants.js'
import { createRng } from '../rng.js'
import { colourOfPad, makePads, nameOfColour, MAX_NAMED_PADS } from './pads.js'
import type { GenerateContext } from './types.js'

function context(seed = 3): GenerateContext {
  return {
    id: 'obj-1',
    world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    rng: createRng(seed),
    level: 1,
    players: [],
  }
}

describe('making pads', () => {
  it('puts every pad wholly inside the world', () => {
    const pads = makePads(context(), 4, 2, 1.2)

    expect(pads).toHaveLength(4)
    for (const pad of pads) {
      expect(pad.x - pad.radius).toBeGreaterThanOrEqual(0)
      expect(pad.y - pad.radius).toBeGreaterThanOrEqual(0)
      expect(pad.x + pad.radius).toBeLessThanOrEqual(WORLD_WIDTH)
      expect(pad.y + pad.radius).toBeLessThanOrEqual(WORLD_HEIGHT)
    }
  })

  /**
   * Overlapping pads would let a blob stand on two at once, which makes
   * "which pad are you on?" unanswerable — so this holds however many pads
   * there are, however big the crowd they are meant to hold, and whatever the
   * seed. A pad squashed down to fit is fine; two pads sharing floor is not.
   */
  it('keeps them off each other, so a blob is only ever on one', () => {
    for (let count = 2; count <= MAX_NAMED_PADS; count++) {
      for (let capacity = 2; capacity <= 8; capacity++) {
        for (let seed = 0; seed < 25; seed++) {
          const pads = makePads(context(seed), count, capacity, 1.7)
          for (const [index, pad] of pads.entries()) {
            for (const other of pads.slice(index + 1)) {
              expect(Math.hypot(pad.x - other.x, pad.y - other.y)).toBeGreaterThan(
                pad.radius + other.radius,
              )
            }
          }
        }
      }
    }
  })

  it('spreads them over the floor rather than stacking them up one side', () => {
    const pads = makePads(context(4), 4, 2, 1.2)
    const spread = Math.max(...pads.map((pad) => pad.x)) - Math.min(...pads.map((pad) => pad.x))

    expect(spread).toBeGreaterThan(WORLD_WIDTH / 3)
  })

  it('gives each one a colour of its own, up to the ones with names', () => {
    const pads = makePads(context(), MAX_NAMED_PADS, 2, 1)
    const colours = new Set(pads.map((pad) => pad.colour))

    expect(colours.size).toBe(MAX_NAMED_PADS)
  })

  it('makes a bigger pad for a bigger crowd, and a tighter one when squeezed', () => {
    const [two] = makePads(context(), 2, 2, 1)
    const [four] = makePads(context(), 2, 4, 1)
    const [squashed] = makePads(context(), 2, 2, 0.7)

    expect(four?.radius).toBeGreaterThan(two?.radius ?? 0)
    expect(squashed?.radius).toBeLessThan(two?.radius ?? 0)
  })

  /** However many blobs a pad is meant to hold, it has to fit on the floor. */
  it('will not make a pad bigger than its own share of the floor', () => {
    const [huge] = makePads(context(), 4, 40, 3)

    expect(huge?.radius).toBeLessThan(WORLD_WIDTH / 4 / 2)
  })

  it('gives every pad a name that can be read out loud', () => {
    for (const [index] of ZONE_COLOURS.entries()) {
      expect(nameOfColour(colourOfPad(index))).toMatch(/^[a-z]+$/)
    }
    expect(nameOfColour('#123456')).toBe('shiny')
  })
})
