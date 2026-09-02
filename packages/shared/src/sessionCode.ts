/**
 * A session code names the world the current TV is running. It is not a room
 * selector — there is only ever one world — and it is not a password: nobody
 * ever reads it, types it or scans it.
 *
 * It exists so that a phone can tell one world from the next. The relay mints
 * a fresh one every time a TV attaches and hands it to whoever connects; a
 * phone holding a different one is holding an identity from a world that no
 * longer exists, and comes back in as a new player.
 */

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
