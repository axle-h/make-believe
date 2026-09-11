import { describe, expect, it } from 'vitest'
import { BLOB_COLOURS, WORLD_HEIGHT, WORLD_WIDTH, ZONE_COLOURS } from '../constants.js'
import { radiusFor } from '../zones.js'
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
    crown: null,
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

  /** Across counts, crowds and seeds: a squashed pad is fine, two sharing floor is not. */
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

  it('lays out fewer pads rather than shrinking one below its crowd', () => {
    const roomy = makePads(context(), 4, 8, 1.7)

    expect(roomy.length).toBeLessThan(4)
    for (const pad of roomy) expect(pad.radius).toBeGreaterThanOrEqual(radiusFor(8, 1))
  })

  it('gives up the count only as far as it has to', () => {
    expect(makePads(context(), 4, 2, 1.2)).toHaveLength(4)
  })

  it('keeps a single pad inside the world however big the crowd', () => {
    const [huge] = makePads(context(), 4, 40, 3)

    expect(huge?.radius).toBeLessThanOrEqual(WORLD_HEIGHT / 2)
  })

  it('keeps an exact count, and shrinks the pads to do it', () => {
    const pads = makePads(context(), 4, 8, 1.7, { exactly: true })

    expect(pads).toHaveLength(4)
    for (const pad of pads) expect(pad.radius).toBeLessThan(radiusFor(8, 1.7))
  })

  it('gives every pad a name that can be read out loud', () => {
    for (const [index] of ZONE_COLOURS.entries()) {
      expect(nameOfColour(colourOfPad(index))).toMatch(/^[a-z]+$/)
    }
    expect(nameOfColour('#123456')).toBe('shiny')
  })

  /** The floor palette is checked first, so a shared hex would take the pad's name. */
  it('calls every blob colour by its own name', () => {
    for (const colour of BLOB_COLOURS) expect(nameOfColour(colour.hex)).toBe(colour.name)
  })

  it('has ten blob colours, each with a name of its own', () => {
    expect(BLOB_COLOURS).toHaveLength(10)
    expect(new Set(BLOB_COLOURS.map((colour) => colour.name)).size).toBe(BLOB_COLOURS.length)
    expect(new Set(BLOB_COLOURS.map((colour) => colour.hex)).size).toBe(BLOB_COLOURS.length)
  })
})
