import { PAINTS } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { averageColour, blend, distance, looksLikePaint, nearestPaint, toRgb } from './colour.js'

describe('reading a colour', () => {
  it('turns a hex string into numbers', () => {
    expect(toRgb('#ff5d5d')).toEqual({ r: 255, g: 93, b: 93 })
    expect(toRgb('4ea8ff')).toEqual({ r: 78, g: 168, b: 255 })
  })

  it('calls anything it cannot read black, rather than throwing', () => {
    expect(toRgb('nonsense')).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('naming a colour', () => {
  it('knows every crayon by itself', () => {
    for (const paint of PAINTS) {
      expect(nearestPaint(toRgb(paint.hex)).name).toBe(paint.name)
    }
  })

  it('calls a rough approximation what a child would call it', () => {
    // A red blob scribbled over with a bit of everything is still red.
    expect(nearestPaint({ r: 230, g: 90, b: 100 }).name).toBe('red')
    expect(nearestPaint({ r: 90, g: 200, b: 120 }).name).toBe('green')
    expect(nearestPaint({ r: 250, g: 215, b: 70 }).name).toBe('yellow')
  })

  /** Two black dots for eyes on a white blob is white, not black. */
  it('answers by the whole of the drawing, not the darkest bit of it', () => {
    expect(nearestPaint({ r: 226, g: 224, b: 214 }).name).toBe('white')
  })

  it('measures nothing as no distance at all', () => {
    expect(distance({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 })).toBe(0)
    expect(distance({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeGreaterThan(0)
  })
})

/** Four pixels of RGBA, as a canvas hands them over. */
function pixels(...rgba: number[][]): number[] {
  return rgba.flat()
}

describe('averaging a drawing', () => {
  it('takes the middle of what is there', () => {
    const average = averageColour(pixels([200, 0, 0, 255], [100, 0, 0, 255]))

    expect(average).toEqual({ r: 150, g: 0, b: 0 })
  })

  /**
   * The drawing is a rounded square on a transparent sheet. Counting its empty
   * corners would drag every colour towards nothing and make every blob look
   * darker than the child painted it.
   */
  it('ignores the transparent corners entirely', () => {
    const average = averageColour(
      pixels([0, 255, 0, 255], [0, 0, 0, 0], [0, 0, 0, 0], [0, 255, 0, 255]),
    )

    expect(average).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('counts a half-faded pixel for half', () => {
    const average = averageColour(pixels([0, 0, 200, 255], [0, 0, 0, 128]))

    expect(average?.b).toBeGreaterThan(120)
  })

  it('says nothing at all about an empty drawing', () => {
    expect(averageColour(pixels([0, 0, 0, 0], [255, 255, 255, 0]))).toBeNull()
    expect(averageColour([])).toBeNull()
  })
})

describe('mixing two colours', () => {
  it('takes none, half and all of the way', () => {
    const black = { r: 0, g: 0, b: 0 }
    const white = { r: 200, g: 100, b: 50 }

    expect(blend(black, white, 0)).toEqual(black)
    expect(blend(black, white, 1)).toEqual(white)
    expect(blend(black, white, 0.5)).toEqual({ r: 100, g: 50, b: 25 })
  })
})

/**
 * What a blob may fairly be called. The blob's own colour counts as well as
 * what has been drawn on it, because the drawing arrives pre-filled in that
 * colour and a face drawn over the top should not undo it.
 */
describe('what a blob looks like', () => {
  const blue = PAINTS.find((paint) => paint.name === 'blue')!
  const green = PAINTS.find((paint) => paint.name === 'green')!
  const black = PAINTS.find((paint) => paint.name === 'black')!

  it('takes a drawing that is plainly the colour, whatever the blob was', () => {
    expect(looksLikePaint('green', toRgb(green.hex), '#ff5d5d')).toBe(true)
  })

  it('counts a blue blob scribbled over in black as blue after all', () => {
    // Blue underneath, a proper face's worth of black on top: the average
    // lands nearer black than blue, and the blob is still a blue one.
    const scribbled = blend(toRgb(blue.hex), toRgb(black.hex), 0.55)
    expect(nearestPaint(scribbled).name).not.toBe('blue')

    expect(looksLikePaint('blue', scribbled, blue.hex)).toBe(true)
  })

  it('does not turn a red blob green just for being asked', () => {
    expect(looksLikePaint('green', toRgb('#ff5d5d'), '#ff5d5d')).toBe(false)
  })
})
