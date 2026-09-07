/**
 * Colours as numbers, and how far apart two of them look.
 *
 * There is very little here on purpose. Find-your-own-pad is the one task that
 * asks the question — which of these pads is nearest my colour — and a hex
 * string and a subtraction are the whole of what it needs.
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
