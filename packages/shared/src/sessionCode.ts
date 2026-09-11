// Names the world the current TV is running, so a phone can tell one from the next. It is not
// a room selector or a password: nobody reads, types or scans it.

/** Uppercase letters and digits with the ambiguous 0/O and 1/I pairs removed. */
export const SESSION_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const SESSION_CODE_LENGTH = 4

export function generateSessionCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    const index = Math.floor(random() * SESSION_CODE_CHARSET.length) % SESSION_CODE_CHARSET.length
    code += SESSION_CODE_CHARSET[index]
  }
  return code
}

export function isValidSessionCode(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== SESSION_CODE_LENGTH) return false
  return [...value].every((char) => SESSION_CODE_CHARSET.includes(char))
}
