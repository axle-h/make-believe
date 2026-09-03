import { BLOB_SIZE, clamp, SPEED } from '../game/index.js'

/**
 * The bounce. A blob is a square that slides about; this is what turns it into
 * something that hops along, flattening as it lands and stretching as it
 * leaves the floor.
 *
 * It is presentation and only presentation. The model owns every position and
 * nothing here is ever read back into it — two things deciding where a blob is
 * would be exactly the muddle the pure model exists to avoid — so all this
 * offers the scene is an offset, a pair of scales and a lean to draw with.
 *
 * It sits beside the scene rather than under `game/` because a bounce is not
 * game state: nothing about the world changes if it never happens. It is a
 * file of its own rather than a corner of `worldScene` because the maths is
 * the one part of it worth being sure about, and this way it can be tested
 * without a canvas.
 */

/**
 * How far a blob travels per hop, in world units. The hop is paced by ground
 * covered rather than by the clock, so a blob creeping along takes long slow
 * hops and one at full tilt scampers — at full speed that is a little over
 * three hops a second.
 */
export const HOP_DISTANCE = 130

/** How far off the floor the top of a hop is, at full bounce. */
export const HOP_HEIGHT = 10

/** How much a blob squashes and stretches, as a share of its own size. */
export const SQUASH = 0.14

/** How far a blob leans into its run, in radians. About four degrees. */
export const LEAN = 0.07

/** Slower than this counts as standing still... */
const STILL_SPEED = 25

/**
 * ...and this fast is as bouncy as it gets. Well under `SPEED`, because a
 * child who is only half pushing the stick is still plainly running.
 */
const FULL_SPEED = SPEED * 0.5

/** How quickly a blob gets going, and how long it takes to settle afterwards. */
const RISE_MS = 90
const SETTLE_MS = 260

/** How quickly a lean follows a change of direction. */
const TURN_MS = 140

/** One blob's bounce. The scene keeps one of these per blob on screen. */
export interface Squelch {
  /** Where in the current hop it is: 0 and 1 are both on the floor. */
  phase: number
  /** How much hop is actually happening, 0 to 1. */
  bounce: number
  /** Which way it is running and how hard, -1 to 1, smoothed. */
  lean: number
}

/** How to draw a blob this frame. */
export interface Pose {
  /** How far off the floor it is, in world units. */
  lift: number
  scaleX: number
  scaleY: number
  /** Radians to turn it by. */
  rotation: number
}

/** A blob standing still: a plain square, exactly as it was drawn before. */
export function restingSquelch(): Squelch {
  return { phase: 0, bounce: 0, lean: 0 }
}

/**
 * Advance one blob's bounce, given how far it actually moved this frame.
 *
 * Actually moved, not what its joystick asked for: a blob shoved by somebody
 * else bounces, and one driving into a wall does not.
 */
export function stepSquelch(current: Squelch, dx: number, dy: number, dtMs: number): Squelch {
  if (dtMs <= 0) return current

  const distance = Math.hypot(dx, dy)
  const speed = (distance / dtMs) * 1000

  // Springing up is quicker than settling down, which is most of the
  // difference between a blob that sets off and one that comes to a stop.
  const wanted = ramp(speed, STILL_SPEED, FULL_SPEED)
  const bounce = approach(
    current.bounce,
    wanted,
    dtMs,
    wanted > current.bounce ? RISE_MS : SETTLE_MS,
  )

  // A blob that stops mid-hop keeps the phase it stopped at and sinks to the
  // floor as the bounce fades, rather than finishing the arc it was in. From
  // the sofa that is a blob settling, and it costs nothing to say.
  const phase = wrap(current.phase + distance / HOP_DISTANCE)
  const towards = clamp(((dx / dtMs) * 1000) / SPEED, -1, 1)
  const lean = approach(current.lean, towards, dtMs, TURN_MS)

  return { phase, bounce, lean }
}

/** What that bounce looks like: how high, how squashed, how far over. */
export function poseOf(squelch: Squelch): Pose {
  // One arc per hop: on the floor at either end, highest in the middle.
  const arc = Math.sin(squelch.phase * Math.PI)
  // Flat on the floor and tall at the top of the hop, which is the same curve
  // a half turn on: cos(2πp) is 1 - 2·sin²(πp), so the sine already has it.
  const squash = SQUASH * squelch.bounce * (1 - 2 * arc * arc)
  return {
    lift: HOP_HEIGHT * squelch.bounce * arc,
    scaleX: 1 + squash,
    scaleY: 1 - squash,
    rotation: LEAN * squelch.lean * squelch.bounce,
  }
}

/**
 * Where to put the middle of the sprite, given where the model says the blob
 * is. A blob squashes onto the floor rather than shrinking on the spot, so
 * what stays put as it flattens is its bottom edge.
 */
export function drawnCentre(y: number, pose: Pose): number {
  return y + BLOB_SIZE / 2 - (BLOB_SIZE * pose.scaleY) / 2 - pose.lift
}

/** The top of the blob as drawn, which is what its name hangs off. */
export function drawnTop(y: number, pose: Pose): number {
  return drawnCentre(y, pose) - (BLOB_SIZE * pose.scaleY) / 2
}

/** 0 below `from`, 1 above `to`, and straight up the middle in between. */
function ramp(value: number, from: number, to: number): number {
  if (value <= from) return 0
  if (value >= to) return 1
  return (value - from) / (to - from)
}

/**
 * Move a value part of the way to where it should be. The share is worked out
 * from the step so that the same journey takes the same time whether the TV is
 * managing sixty frames a second or thirty.
 */
function approach(current: number, target: number, dtMs: number, overMs: number): number {
  return current + (target - current) * (1 - Math.exp(-dtMs / overMs))
}

/** Keep a phase inside one hop. */
function wrap(phase: number): number {
  return phase - Math.floor(phase)
}
