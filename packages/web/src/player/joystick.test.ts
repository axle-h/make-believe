import { describe, expect, it } from 'vitest'
import {
  ZERO,
  clampToUnitCircle,
  createInputThrottle,
  vectorFromPointer,
} from './joystick.js'

const centre = { x: 100, y: 100 }

describe('vectorFromPointer', () => {
  it('is zero in the dead zone', () => {
    expect(vectorFromPointer(centre, { x: 100, y: 100 }, 50)).toEqual(ZERO)
    expect(vectorFromPointer(centre, { x: 105, y: 100 }, 50)).toEqual(ZERO)
  })

  it('reaches full deflection at the rim', () => {
    expect(vectorFromPointer(centre, { x: 150, y: 100 }, 50)).toEqual({ dx: 1, dy: 0 })
    expect(vectorFromPointer(centre, { x: 100, y: 50 }, 50)).toEqual({ dx: 0, dy: -1 })
  })

  it('clamps beyond the rim to the unit circle', () => {
    const vector = vectorFromPointer(centre, { x: 400, y: 400 }, 50)
    expect(Math.hypot(vector.dx, vector.dy)).toBeCloseTo(1, 3)
    expect(vector.dx).toBeCloseTo(Math.SQRT1_2, 2)
    expect(vector.dy).toBeCloseTo(Math.SQRT1_2, 2)
  })

  it('points down for a pointer below the centre', () => {
    const vector = vectorFromPointer(centre, { x: 100, y: 140 }, 50)
    expect(vector.dx).toBe(0)
    expect(vector.dy).toBeGreaterThan(0)
    expect(vector.dy).toBeLessThan(1)
  })

  it('is zero for a pad with no size', () => {
    expect(vectorFromPointer(centre, { x: 120, y: 100 }, 0)).toEqual(ZERO)
  })
})

describe('clampToUnitCircle', () => {
  it('leaves a short vector alone and shortens a long one', () => {
    expect(clampToUnitCircle({ dx: 0.5, dy: -0.5 })).toEqual({ dx: 0.5, dy: -0.5 })
    const clamped = clampToUnitCircle({ dx: 3, dy: 4 })
    expect(Math.hypot(clamped.dx, clamped.dy)).toBeCloseTo(1, 3)
  })
})

describe('createInputThrottle', () => {
  it('sends the first vector', () => {
    const throttle = createInputThrottle()
    expect(throttle.shouldSend(0, { dx: 1, dy: 0 })).toBe(true)
  })

  it('does not send an unchanged vector', () => {
    const throttle = createInputThrottle()
    throttle.shouldSend(0, { dx: 1, dy: 0 })
    expect(throttle.shouldSend(1000, { dx: 1, dy: 0 })).toBe(false)
    expect(throttle.shouldSend(2000, { dx: 1, dy: 0.01 })).toBe(false)
  })

  it('does not send more than once per interval', () => {
    const throttle = createInputThrottle({ minIntervalMs: 33 })
    expect(throttle.shouldSend(0, { dx: 0, dy: 1 })).toBe(true)
    expect(throttle.shouldSend(10, { dx: 0, dy: 0.5 })).toBe(false)
    expect(throttle.shouldSend(32, { dx: 0, dy: 0.4 })).toBe(false)
    expect(throttle.shouldSend(33, { dx: 0, dy: 0.3 })).toBe(true)
  })

  it('caps a fast stream of moves at about 30 a second', () => {
    const throttle = createInputThrottle({ minIntervalMs: 33 })
    let sent = 0
    for (let now = 0; now < 1000; now += 4) {
      // A thumb sliding steadily across the pad.
      if (throttle.shouldSend(now, { dx: now / 1000, dy: 0 })) sent++
    }
    expect(sent).toBeLessThanOrEqual(31)
    expect(sent).toBeGreaterThan(25)
  })

  it('treats a recorded send as the last one', () => {
    const throttle = createInputThrottle({ minIntervalMs: 33 })
    throttle.record(100, ZERO)
    expect(throttle.shouldSend(110, ZERO)).toBe(false)
    expect(throttle.shouldSend(200, ZERO)).toBe(false)
    expect(throttle.shouldSend(200, { dx: 0.5, dy: 0 })).toBe(true)
  })
})
