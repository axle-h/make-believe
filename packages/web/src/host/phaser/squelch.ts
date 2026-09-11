import { BLOB_SIZE, clamp, SPEED } from '../game/index.js'

/** The bounce is presentation only: the model owns every position and nothing here is read back into it. */

/** The hop is paced by ground covered, not by the clock. */
export const HOP_DISTANCE = 130

export const HOP_HEIGHT = 10

export const SQUASH = 0.14

export const LEAN = 0.07

const STILL_SPEED = 25

/** Well under `SPEED`: half a push on the stick is still plainly running. */
const FULL_SPEED = SPEED * 0.5

const RISE_MS = 90
const SETTLE_MS = 260

const TURN_MS = 140

export interface Squelch {
  /** 0 and 1 are both on the floor. */
  phase: number
  bounce: number
  lean: number
}

export interface Pose {
  lift: number
  scaleX: number
  scaleY: number
  rotation: number
}

export function restingSquelch(): Squelch {
  return { phase: 0, bounce: 0, lean: 0 }
}

/** Driven by how far the blob actually moved, not its joystick: shoved blobs bounce, walled ones do not. */
export function stepSquelch(current: Squelch, dx: number, dy: number, dtMs: number): Squelch {
  if (dtMs <= 0) return current

  const distance = Math.hypot(dx, dy)
  const speed = (distance / dtMs) * 1000

  const wanted = ramp(speed, STILL_SPEED, FULL_SPEED)
  const bounce = approach(
    current.bounce,
    wanted,
    dtMs,
    wanted > current.bounce ? RISE_MS : SETTLE_MS,
  )

  const phase = wrap(current.phase + distance / HOP_DISTANCE)
  const towards = clamp(((dx / dtMs) * 1000) / SPEED, -1, 1)
  const lean = approach(current.lean, towards, dtMs, TURN_MS)

  return { phase, bounce, lean }
}

export function poseOf(squelch: Squelch): Pose {
  const arc = Math.sin(squelch.phase * Math.PI)
  // cos(2πp) is 1 - 2·sin²(πp): flat on the floor, tall at the top.
  const squash = SQUASH * squelch.bounce * (1 - 2 * arc * arc)
  return {
    lift: HOP_HEIGHT * squelch.bounce * arc,
    scaleX: 1 + squash,
    scaleY: 1 - squash,
    rotation: LEAN * squelch.lean * squelch.bounce,
  }
}

/** A blob squashes onto the floor, so its bottom edge stays put as it flattens. */
export function drawnCentre(y: number, pose: Pose): number {
  return y + BLOB_SIZE / 2 - (BLOB_SIZE * pose.scaleY) / 2 - pose.lift
}

export function drawnTop(y: number, pose: Pose): number {
  return drawnCentre(y, pose) - (BLOB_SIZE * pose.scaleY) / 2
}

function ramp(value: number, from: number, to: number): number {
  if (value <= from) return 0
  if (value >= to) return 1
  return (value - from) / (to - from)
}

/** Exponential, so the same journey takes the same time at any frame rate. */
function approach(current: number, target: number, dtMs: number, overMs: number): number {
  return current + (target - current) * (1 - Math.exp(-dtMs / overMs))
}

function wrap(phase: number): number {
  return phase - Math.floor(phase)
}
