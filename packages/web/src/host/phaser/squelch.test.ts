import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, SPEED } from '../game/index.js'
import {
  drawnCentre,
  drawnTop,
  HOP_DISTANCE,
  HOP_HEIGHT,
  poseOf,
  restingSquelch,
  SQUASH,
  stepSquelch,
  type Squelch,
} from './squelch.js'

/**
 * The bounce never moves a blob — the model does that — so everything here is
 * about what gets drawn: how high, how squashed, how far over, and how quickly
 * each of those comes and goes.
 */

/** Drive a blob at a velocity in world units per second for a while. */
function run(from: Squelch, vx: number, vy: number, ms: number, stepMs = 16): Squelch {
  let squelch = from
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    squelch = stepSquelch(squelch, (vx * stepMs) / 1000, (vy * stepMs) / 1000, stepMs)
  }
  return squelch
}

/** Every pose a blob strikes over a run, for the ones that are about the whole hop. */
function poses(from: Squelch, vx: number, ms: number, stepMs = 16) {
  let squelch = from
  const seen = []
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    squelch = stepSquelch(squelch, (vx * stepMs) / 1000, 0, stepMs)
    seen.push(poseOf(squelch))
  }
  return seen
}

describe('a blob standing still', () => {
  it('is a plain square, exactly as it was before any of this', () => {
    const pose = poseOf(restingSquelch())

    expect(pose.lift).toBe(0)
    expect(pose.scaleX).toBe(1)
    expect(pose.scaleY).toBe(1)
    expect(pose.rotation).toBe(0)
  })

  it('stays plain however long it stands there', () => {
    const pose = poseOf(run(restingSquelch(), 0, 0, 2000))

    expect(pose.lift).toBeCloseTo(0)
    expect(pose.scaleX).toBeCloseTo(1)
    expect(pose.scaleY).toBeCloseTo(1)
  })

  /**
   * Blobs shove each other apart a pixel at a time, so a pair leaning together
   * is technically moving. If that counted as running, a huddle would shimmer.
   */
  it('is not set off by being nudged a pixel at a time', () => {
    const squelch = run(restingSquelch(), 10, 0, 2000)

    expect(squelch.bounce).toBeCloseTo(0)
  })
})

describe('a blob on the move', () => {
  it('gets bouncing', () => {
    const squelch = run(restingSquelch(), SPEED, 0, 500)

    expect(squelch.bounce).toBeGreaterThan(0.95)
  })

  it('leaves the floor and comes back to it, over and over', () => {
    const lifts = poses(restingSquelch(), SPEED, 2000).map((pose) => pose.lift)

    expect(Math.max(...lifts)).toBeGreaterThan(HOP_HEIGHT * 0.9)
    expect(Math.min(...lifts)).toBeLessThan(HOP_HEIGHT * 0.1)
    expect(Math.min(...lifts)).toBeGreaterThanOrEqual(0)
  })

  /**
   * The hop is paced by ground covered rather than by the clock, so half speed
   * is long slow hops rather than the same scamper in slow motion.
   */
  it('takes one hop per stretch of floor, whatever speed it covers it at', () => {
    const quick = run(restingSquelch(), SPEED, 0, 400)
    const slow = run(restingSquelch(), SPEED / 2, 0, 800)

    expect(quick.phase).toBeCloseTo(slow.phase, 6)
    // 400ms at full speed is 168 units, which is one hop and a bit over a fifth.
    expect(quick.phase).toBeCloseTo(((SPEED * 0.4) % HOP_DISTANCE) / HOP_DISTANCE, 6)
  })

  it('settles back to a plain square when the phone lets go', () => {
    const stopped = run(run(restingSquelch(), SPEED, 0, 1000), 0, 0, 1500)
    const pose = poseOf(stopped)

    expect(stopped.bounce).toBeLessThan(0.01)
    expect(pose.lift).toBeCloseTo(0, 1)
    expect(pose.scaleX).toBeCloseTo(1, 2)
    expect(pose.scaleY).toBeCloseTo(1, 2)
  })

  it('is unmoved by a frame with no time in it', () => {
    const squelch = run(restingSquelch(), SPEED, 0, 200)

    expect(stepSquelch(squelch, 7, 0, 0)).toBe(squelch)
  })
})

describe('the squash', () => {
  it('is flat on the floor and tall at the top of the hop', () => {
    const landed = poseOf({ phase: 0, bounce: 1, lean: 0 })
    const airborne = poseOf({ phase: 0.5, bounce: 1, lean: 0 })

    expect(landed.lift).toBeCloseTo(0)
    expect(landed.scaleY).toBeCloseTo(1 - SQUASH)
    expect(landed.scaleX).toBeCloseTo(1 + SQUASH)

    expect(airborne.lift).toBeCloseTo(HOP_HEIGHT)
    expect(airborne.scaleY).toBeCloseTo(1 + SQUASH)
    expect(airborne.scaleX).toBeCloseTo(1 - SQUASH)
  })

  it('never grows a blob: what it gains one way it gives up the other', () => {
    for (let phase = 0; phase < 1; phase += 0.05) {
      const pose = poseOf({ phase, bounce: 1, lean: 0 })

      expect(pose.scaleX + pose.scaleY).toBeCloseTo(2)
      expect(pose.scaleX).toBeGreaterThan(0)
      expect(pose.scaleY).toBeGreaterThan(0)
    }
  })
})

describe('the lean', () => {
  it('goes the way the blob is running, and straightens up when it stops', () => {
    const right = poseOf(run(restingSquelch(), SPEED, 0, 600))
    const left = poseOf(run(restingSquelch(), -SPEED, 0, 600))
    const stopped = poseOf(run(run(restingSquelch(), SPEED, 0, 600), 0, 0, 1500))

    expect(right.rotation).toBeGreaterThan(0)
    expect(left.rotation).toBeCloseTo(-right.rotation, 6)
    expect(stopped.rotation).toBeCloseTo(0, 3)
  })

  it('leaves a blob running straight up the screen upright', () => {
    const pose = poseOf(run(restingSquelch(), 0, SPEED, 600))

    expect(pose.rotation).toBeCloseTo(0)
    expect(pose.lift).toBeGreaterThan(0)
  })
})

describe('where the sprite goes', () => {
  it('leaves a resting blob exactly where the model put it', () => {
    const pose = poseOf(restingSquelch())

    expect(drawnCentre(300, pose)).toBe(300)
    expect(drawnTop(300, pose)).toBe(300 - BLOB_SIZE / 2)
  })

  it('squashes a blob onto the floor rather than shrinking it on the spot', () => {
    const pose = poseOf({ phase: 0, bounce: 1, lean: 0 })
    const foot = drawnCentre(300, pose) + (BLOB_SIZE * pose.scaleY) / 2

    expect(foot).toBeCloseTo(300 + BLOB_SIZE / 2)
  })

  it('lifts the whole blob, feet and all, at the top of a hop', () => {
    const pose = poseOf({ phase: 0.5, bounce: 1, lean: 0 })
    const foot = drawnCentre(300, pose) + (BLOB_SIZE * pose.scaleY) / 2

    expect(foot).toBeCloseTo(300 + BLOB_SIZE / 2 - HOP_HEIGHT)
    expect(drawnTop(300, pose)).toBeLessThan(300 - BLOB_SIZE / 2)
  })
})
