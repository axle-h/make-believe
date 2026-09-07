import { describe, expect, it } from 'vitest'
import { distance, toRgb } from './colour.js'

describe('reading a colour', () => {
  it('turns a hex string into numbers', () => {
    expect(toRgb('#ff5d5d')).toEqual({ r: 255, g: 93, b: 93 })
    expect(toRgb('4ea8ff')).toEqual({ r: 78, g: 168, b: 255 })
  })

  it('calls anything it cannot read black, rather than throwing', () => {
    expect(toRgb('nonsense')).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('how far apart two colours look', () => {
  it('is nothing at all for a colour against itself', () => {
    expect(distance(toRgb('#5ddf7f'), toRgb('#5ddf7f'))).toBe(0)
  })

  it('puts two greens nearer each other than either is to red', () => {
    const green = toRgb('#5ddf7f')
    const otherGreen = toRgb('#4ecf70')
    const red = toRgb('#ff5d5d')

    expect(distance(green, otherGreen)).toBeLessThan(distance(green, red))
  })

  it('does not care which way round it is asked', () => {
    const blue = toRgb('#4ea8ff')
    const yellow = toRgb('#ffd23f')

    expect(distance(blue, yellow)).toBeCloseTo(distance(yellow, blue))
  })
})
