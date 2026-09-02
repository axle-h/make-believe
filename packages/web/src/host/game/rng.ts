/**
 * A seeded random number generator, because the model is pure and unit-tested
 * and `Math.random` is neither. Every objective the director makes comes out of
 * this, so a test can seed it and assert exactly which spot appeared where.
 *
 * mulberry32: fast, tiny, and far better than anything a game for children can
 * tell apart from real randomness.
 */

export interface Rng {
  /** The next number in [0, 1). */
  next(): number
}

/** A generator that will always produce the same run from the same seed. */
export function createRng(seed: number): Rng {
  // Keep the state in 32 unsigned bits, which is what the algorithm assumes.
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d_2b_79_f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
    },
  }
}

/**
 * A seed for a world nobody is testing. The model stays pure — this is only
 * ever called by whoever builds a game, never by anything the director does.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4_294_967_296)
}

/** A number in [min, max). */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min)
}

/** A whole number in [min, max], both ends included. */
export function intRange(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1))
}

/** One of these, please. Throws on an empty list rather than returning undefined. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng.next() * items.length)]
  if (item === undefined) throw new Error('nothing to pick from')
  return item
}

export interface Bounds {
  width: number
  height: number
}

/**
 * Somewhere inside the world, kept `margin` away from every wall so that
 * whatever is put there is wholly on screen.
 */
export function pointInBounds(rng: Rng, bounds: Bounds, margin: number): { x: number; y: number } {
  // A margin too big for the world would invert the range; sit in the middle.
  const room = { x: Math.max(0, bounds.width / 2 - margin), y: Math.max(0, bounds.height / 2 - margin) }
  return {
    x: bounds.width / 2 + range(rng, -room.x, room.x),
    y: bounds.height / 2 + range(rng, -room.y, room.y),
  }
}
