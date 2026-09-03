/**
 * A blob's name: what a player types on the phone and what the TV draws above
 * their square. It lives next to the room-code helpers so the player page, the
 * message schemas and the host all agree on what a usable name is.
 */

/**
 * Longest blob name a player may pick. Five characters is short on purpose:
 * it sits above a blob without ever being wider than the blob itself, and a
 * name that short is one a four-year-old finishes typing.
 */
export const MAX_NAME_LENGTH = 5

/** Control characters (C0 and C1) have no business being drawn on the TV. */
function isPrintable(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  const isC0 = code < 0x20
  const isC1 = code >= 0x7f && code <= 0x9f
  return !isC0 && !isC1
}

/**
 * Tidy up what a phone keyboard produced: no control characters, no runs of
 * whitespace, no padding. It does not truncate — an overlong name is a
 * validation failure, not something to silently cut in half.
 */
export function normaliseName(value: string): string {
  // Spread iterates code points, so emoji survive in one piece.
  const printable = [...value].map((character) => (isPrintable(character) ? character : ' ')).join('')
  return printable.replace(/\s+/g, ' ').trim()
}

/**
 * Two names that are the same label on a TV. "IVY" and "ivy" are one blob's
 * worth of name, so the world refuses the second of them — and only the world
 * decides that; both ends share this so that a join screen can grey a name out
 * as it is typed and be right about it.
 */
export function sameName(a: string, b: string): boolean {
  return normaliseName(a).toLowerCase() === normaliseName(b).toLowerCase()
}

/** True if this is something we would happily draw above a blob. */
export function isValidName(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const name = normaliseName(value)
  return name.length > 0 && name.length <= MAX_NAME_LENGTH
}
