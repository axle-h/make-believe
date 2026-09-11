/** Short enough that the label above a blob is never wider than the blob. */
export const MAX_NAME_LENGTH = 5

function isPrintable(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  const isC0 = code < 0x20
  const isC1 = code >= 0x7f && code <= 0x9f
  return !isC0 && !isC1
}

/** Never truncates: an overlong name is a validation failure, not something to cut in half. */
export function normaliseName(value: string): string {
  const printable = [...value].map((character) => (isPrintable(character) ? character : ' ')).join('')
  return printable.replace(/\s+/g, ' ').trim()
}

/** What both ends compare names with: "IVY" and "ivy" are one label, and the world refuses the second. */
export function sameName(a: string, b: string): boolean {
  return normaliseName(a).toLowerCase() === normaliseName(b).toLowerCase()
}

export function isValidName(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const name = normaliseName(value)
  return name.length > 0 && name.length <= MAX_NAME_LENGTH
}
