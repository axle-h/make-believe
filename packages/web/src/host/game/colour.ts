export interface Rgb {
  r: number
  g: number
  b: number
}

/** Anything unparseable comes back black. */
export function toRgb(hex: string): Rgb {
  const digits = hex.replace('#', '')
  if (digits.length !== 6) return { r: 0, g: 0, b: 0 }
  return {
    r: Number.parseInt(digits.slice(0, 2), 16) || 0,
    g: Number.parseInt(digits.slice(2, 4), 16) || 0,
    b: Number.parseInt(digits.slice(4, 6), 16) || 0,
  }
}

/** Weighted roughly as an eye weighs the channels; near enough for telling blobs apart. */
export function distance(one: Rgb, other: Rgb): number {
  const r = one.r - other.r
  const g = one.g - other.g
  const b = one.b - other.b
  return Math.sqrt(2 * r * r + 4 * g * g + 3 * b * b)
}
