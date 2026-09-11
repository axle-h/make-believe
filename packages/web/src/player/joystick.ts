export interface Point {
  x: number
  y: number
}

export interface Vector {
  dx: number
  dy: number
}

export const ZERO: Vector = { dx: 0, dy: 0 }

/** Anything shorter than this fraction of the pad radius counts as centred. */
export const DEFAULT_DEAD_ZONE = 0.15

/** `dy` is positive downwards, matching screen coordinates. */
export function vectorFromPointer(
  centre: Point,
  pointer: Point,
  radius: number,
  deadZone: number = DEFAULT_DEAD_ZONE,
): Vector {
  if (radius <= 0) return ZERO
  const dx = (pointer.x - centre.x) / radius
  const dy = (pointer.y - centre.y) / radius
  const magnitude = Math.hypot(dx, dy)
  if (magnitude <= deadZone) return ZERO
  // Rescale so the vector still reaches 1 at the rim once the dead zone is gone.
  const scaled = Math.min(1, (magnitude - deadZone) / (1 - deadZone))
  return round({ dx: (dx / magnitude) * scaled, dy: (dy / magnitude) * scaled })
}

export function clampToUnitCircle({ dx, dy }: Vector): Vector {
  const magnitude = Math.hypot(dx, dy)
  if (magnitude <= 1) return round({ dx, dy })
  return round({ dx: dx / magnitude, dy: dy / magnitude })
}

function round({ dx, dy }: Vector): Vector {
  return { dx: Math.round(dx * 1000) / 1000, dy: Math.round(dy * 1000) / 1000 }
}

export interface ThrottleOptions {
  minIntervalMs?: number
  epsilon?: number
}

export interface InputThrottle {
  /** Records the send when it says yes. */
  shouldSend(now: number, vector: Vector): boolean
  /** A send made outside the throttle, such as on releasing the pad. */
  record(now: number, vector: Vector): void
}

export function createInputThrottle({
  minIntervalMs = 33,
  epsilon = 0.02,
}: ThrottleOptions = {}): InputThrottle {
  let last: Vector | null = null
  let lastAt = Number.NEGATIVE_INFINITY

  return {
    shouldSend(now, vector) {
      const changed =
        last === null || Math.abs(vector.dx - last.dx) > epsilon || Math.abs(vector.dy - last.dy) > epsilon
      if (!changed) return false
      if (now - lastAt < minIntervalMs) return false
      last = vector
      lastAt = now
      return true
    },
    record(now, vector) {
      last = vector
      lastAt = now
    },
  }
}
