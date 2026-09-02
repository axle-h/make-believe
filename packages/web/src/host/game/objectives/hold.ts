/**
 * Standing still on purpose. Half the tasks are "get there and stay there for
 * a moment", which is what stops a blob driving straight over a pad from
 * finishing it by accident.
 */

export interface Holding {
  /** How long they have to keep it up, all together. */
  holdMs: number
  /** How much of that they have banked so far. */
  heldMs: number
}

/**
 * One step of a hold: `true` once they have held it long enough.
 *
 * Letting go **drains** the bank rather than emptying it, and this is the one
 * rule every task that holds shares. Blobs shove each other constantly — that
 * is most of the fun — and losing the lot because somebody nudged you off is
 * exactly the sort of unfairness a three-year-old will not stand for.
 */
export function hold(holding: Holding, satisfied: boolean, dtMs: number): boolean {
  if (!satisfied) {
    holding.heldMs = Math.max(0, holding.heldMs - dtMs)
    return false
  }
  holding.heldMs += dtMs
  return holding.heldMs >= holding.holdMs
}

/** Seconds still to stand there, counted the way a child counts along: 3, 2, 1. */
export function secondsLeft(holding: Holding): number {
  return Math.max(1, Math.ceil((holding.holdMs - holding.heldMs) / 1000))
}
