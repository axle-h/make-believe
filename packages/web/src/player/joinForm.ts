import { isValidName, isValidRoomCode, normaliseName, normaliseRoomCode } from '@make-believe/shared'

/**
 * What the join screen thinks of what has been typed so far, as a pure
 * function of the two fields. `main.ts` does the DOM; this decides whether the
 * Join button is live and what the two normalised values are.
 */

export interface JoinFormState {
  /** The code as it will go on the wire, and as the field should now read. */
  room: string
  /** The name as it will go on the wire. */
  name: string
  roomValid: boolean
  nameValid: boolean
  canJoin: boolean
}

export function evaluateJoinForm(rawRoom: string, rawName: string): JoinFormState {
  const room = normaliseRoomCode(rawRoom)
  const name = normaliseName(rawName)
  const roomValid = isValidRoomCode(room)
  const nameValid = isValidName(name)
  return { room, name, roomValid, nameValid, canJoin: roomValid && nameValid }
}

/** What to tell a player who pressed Join with something not quite right. */
export function joinFormError(state: JoinFormState): string {
  if (!state.roomValid) return 'That is not a code from the TV.'
  if (!state.nameValid) return 'Your blob needs a name.'
  return ''
}
