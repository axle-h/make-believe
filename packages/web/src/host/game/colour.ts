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
 * How much of a blob's own colour counts towards what it looks like, on top of
 * whatever has been drawn on it.
 *
 * A drawing arrives as a rounded square already filled in with the blob's
 * colour, so it is in the average once — but a four-year-old asked for blue
 * scribbles enthusiastically, and a face's worth of black lines drags the
 * average off blue and onto nothing in particular. Counting the colour they
 * were given a second time is what puts it back.
 */
const BLOB_SHARE = 0.4

/**
 * Whether a blob can fairly be called this colour: either the drawing reads as
 * it, or the drawing over the blob's own colour does.
 *
 * It is *either* rather than a single blended answer on purpose. A red blob
 * that has painted itself flat green is green, and no amount of red underneath
 * is allowed to take that away — "not green enough" is the one thing this game
 * must never say.
 */
export function looksLikePaint(paint: string, average: Rgb, blobColour: string): boolean {
  if (nearestPaint(average).name === paint) return true
  return nearestPaint(blend(average, toRgb(blobColour), BLOB_SHARE)).name === paint
}

/** Two colours mixed, `share` of the way from the first to the second. */
export function blend(one: Rgb, other: Rgb, share: number): Rgb {
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * share)
  return { r: mix(one.r, other.r), g: mix(one.g, other.g), b: mix(one.b, other.b) }
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
