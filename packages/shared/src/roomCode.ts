/**
 * A room code is the session key for the single world a deployment serves.
 * It is not a room selector: there is only ever one world.
 */

/** Uppercase letters and digits with the ambiguous 0/O and 1/I pairs removed. */
export const ROOM_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const ROOM_CODE_LENGTH = 4

export function generateRoomCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.floor(random() * ROOM_CODE_CHARSET.length) % ROOM_CODE_CHARSET.length
    code += ROOM_CODE_CHARSET[index]
  }
  return code
}

export function isValidRoomCode(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== ROOM_CODE_LENGTH) return false
  return [...value].every((char) => ROOM_CODE_CHARSET.includes(char))
}

/** Tidy up something a person typed on a phone keyboard before validating it. */
export function normaliseRoomCode(value: string): string {
  return value.trim().toUpperCase()
}
