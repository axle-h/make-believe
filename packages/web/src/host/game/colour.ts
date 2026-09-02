import { PAINTS, type Paint } from '@make-believe/shared'

/**
 * What colour a drawing came out. The pixels are decoded by the renderer —
 * that needs a canvas, and the model has none — which hands back one average
 * colour per drawing. Everything here is what the model does with it.
 *
 * A blob is never judged by how close it got: it is judged by which crayon it
 * looks most like, which is a question with an answer even when a four-year-old
 * has scribbled over their own green with a bit of everything.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** `#rrggbb` to numbers. Anything unparseable comes back black. */
export function toRgb(hex: string): Rgb {
  const digits = hex.replace('#', '')
  if (digits.length !== 6) return { r: 0, g: 0, b: 0 }
  return {
    r: Number.parseInt(digits.slice(0, 2), 16) || 0,
    g: Number.parseInt(digits.slice(2, 4), 16) || 0,
    b: Number.parseInt(digits.slice(4, 6), 16) || 0,
  }
}

/**
 * Which crayon this is nearest to. Green and yellow are neighbours and eyes
 * are two black dots, so the answer is the closest of the whole set — asking
 * "is it green enough?" of one colour on its own says yes to far too much.
 */
export function nearestPaint(colour: Rgb): Paint {
  let nearest: Paint = PAINTS[0]
  let shortest = Number.POSITIVE_INFINITY
  for (const paint of PAINTS) {
    const gap = distance(colour, toRgb(paint.hex))
    if (gap >= shortest) continue
    shortest = gap
    nearest = paint
  }
  return nearest
}

/**
 * The one colour a drawing amounts to: every pixel averaged, each weighted by
 * how opaque it is. The blob is a rounded square on a transparent sheet, so
 * the corners have to count for nothing — a picture averaged with its own
 * empty corners comes out darker than anything anybody drew.
 *
 * `null` when there is nothing there at all, which is a drawing nobody has
 * put a mark on rather than a colour to judge.
 */
export function averageColour(pixels: ArrayLike<number>): Rgb | null {
  let r = 0
  let g = 0
  let b = 0
  let weight = 0
  for (let at = 0; at + 3 < pixels.length; at += 4) {
    const alpha = (pixels[at + 3] as number) / 255
    if (alpha <= 0) continue
    r += (pixels[at] as number) * alpha
    g += (pixels[at + 1] as number) * alpha
    b += (pixels[at + 2] as number) * alpha
    weight += alpha
  }
  if (weight <= 0) return null
  return { r: Math.round(r / weight), g: Math.round(g / weight), b: Math.round(b / weight) }
}

/**
 * How far apart two colours look, roughly. The green channel counts for most
 * and the blue for least, which is about how an eye weighs them — near enough
 * for telling a red blob from a blue one, and no cause for a colour space.
 */
export function distance(one: Rgb, other: Rgb): number {
  const r = one.r - other.r
  const g = one.g - other.g
  const b = one.b - other.b
  return Math.sqrt(2 * r * r + 4 * g * g + 3 * b * b)
}
