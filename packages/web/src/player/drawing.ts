import { MAX_PNG_LENGTH, PAINTS, PAINT_HEXES } from '@make-believe/shared'

/**
 * The maths behind the drawing screen, kept pure so it can be unit-tested
 * without a canvas. `main.ts` does the pointer events and the pixels.
 */

/** The drawing is this many pixels square, whatever size it is on screen. */
export const CANVAS_SIZE = 256

/**
 * The blob on the TV is a 72px square with 14px corners; the drawing wears the
 * same shape so it lands on the blob without a mask.
 */
export const CORNER_RATIO = 14 / 72

export const STROKE_WIDTH = 14

/**
 * The colours a child can draw with, dark first. They live in `shared` because
 * the TV has to know them too: a task that asks a room to paint themselves
 * green may only ask for a colour a phone can actually make.
 */
export const CRAYONS = PAINT_HEXES

/** The one a phone starts holding: the dark one, which is what draws a face. */
export const FIRST_CRAYON: string = PAINTS[0].hex

export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export function cornerRadius(size: number = CANVAS_SIZE): number {
  return Math.round(size * CORNER_RATIO)
}

/**
 * Where on the drawing a finger is. The canvas is square but drawn at whatever
 * size fits the phone, so the position has to be scaled back up, and a finger
 * that slides off the edge is held at the edge rather than lost.
 */
export function pointerToCanvas(rect: Rect, pointer: Point, size: number = CANVAS_SIZE): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  const x = ((pointer.x - rect.left) / rect.width) * size
  const y = ((pointer.y - rect.top) / rect.height) * size
  return { x: clamp(x, 0, size), y: clamp(y, 0, size) }
}

/** True if this data URL is something the server will accept. */
export function isSendablePng(dataUrl: string): boolean {
  return dataUrl.startsWith('data:image/png;base64,') && dataUrl.length <= MAX_PNG_LENGTH
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
