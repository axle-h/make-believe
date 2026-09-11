export interface Holding {
  holdMs: number
  heldMs: number
}

/** Letting go drains the bank rather than emptying it, so a nudge off the pad never loses the lot. */
export function hold(holding: Holding, satisfied: boolean, dtMs: number): boolean {
  if (!satisfied) {
    holding.heldMs = Math.max(0, holding.heldMs - dtMs)
    return false
  }
  holding.heldMs += dtMs
  return holding.heldMs >= holding.holdMs
}

/** Whole seconds, never below 1, so a child can count along. */
export function secondsLeft(holding: Holding): number {
  return Math.max(1, Math.ceil((holding.holdMs - holding.heldMs) / 1000))
}
