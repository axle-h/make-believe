import { MAX_PNG_LENGTH, PAINTS, PAINT_HEXES } from '@make-believe/shared'

export const CANVAS_SIZE = 256

/** The TV's blob is a 72px square with 14px corners, and the drawing starts as the same shape. */
export const CORNER_RATIO = 14 / 72

export const STROKE_WIDTH = 14

export const CRAYONS = PAINT_HEXES

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

/** A finger that slides off the edge is held at the edge rather than lost. */
export function pointerToCanvas(rect: Rect, pointer: Point, size: number = CANVAS_SIZE): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  const x = ((pointer.x - rect.left) / rect.width) * size
  const y = ((pointer.y - rect.top) / rect.height) * size
  return { x: clamp(x, 0, size), y: clamp(y, 0, size) }
}

export function isSendablePng(dataUrl: string): boolean {
  return dataUrl.startsWith('data:image/png;base64,') && dataUrl.length <= MAX_PNG_LENGTH
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
