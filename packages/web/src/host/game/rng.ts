/** Seeded (mulberry32) so the model stays pure and a test can predict where every spot appears. */

export interface Rng {
  /** The next number in [0, 1). */
  next(): number
}

export function createRng(seed: number): Rng {
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

/** A seed for a world nobody is testing; tests pass their own so the model stays predictable. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4_294_967_296)
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min)
}

/** Both ends included. */
export function intRange(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1))
}

/** Throws on an empty list rather than returning undefined. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng.next() * items.length)]
  if (item === undefined) throw new Error('nothing to pick from')
  return item
}

export interface Bounds {
  width: number
  height: number
}

export function pointInBounds(rng: Rng, bounds: Bounds, margin: number): { x: number; y: number } {
  // A margin too big for the world would invert the range; sit in the middle.
  const room = { x: Math.max(0, bounds.width / 2 - margin), y: Math.max(0, bounds.height / 2 - margin) }
  return {
    x: bounds.width / 2 + range(rng, -room.x, room.x),
    y: bounds.height / 2 + range(rng, -room.y, room.y),
  }
}
