import { isValidName, normaliseName } from '@make-believe/shared'

/**
 * What the join screen thinks of what has been typed so far, as a pure
 * function of the one field it has. `main.ts` does the DOM; this decides
 * whether the Join button is live and what the name will be on the wire.
 *
 * There is nothing else to ask for. A phone reaches exactly one world — the
 * one that served it this page — and which session of it that is gets settled
 * on the socket, so a name is the whole of getting in.
 */

export interface JoinFormState {
  /** The name as it will go on the wire. */
  name: string
  nameValid: boolean
  canJoin: boolean
}

export function evaluateJoinForm(rawName: string): JoinFormState {
  const name = normaliseName(rawName)
  const nameValid = isValidName(name)
  return { name, nameValid, canJoin: nameValid }
}

/** What to tell a player who pressed Join with something not quite right. */
export function joinFormError(state: JoinFormState): string {
  if (!state.nameValid) return 'Your blob needs a name.'
  return ''
}
