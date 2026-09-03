import { MAX_NAME_LENGTH, isValidName, normaliseName } from '@make-believe/shared'

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

/**
 * What to tell a player who pressed Join with something not quite right. The
 * box will not let five characters be typed past, but a name can still arrive
 * pasted, so the cap is worth a sentence of its own rather than the blanket
 * "needs a name" — which would read as nonsense to somebody looking at one.
 */
export function joinFormError(state: JoinFormState): string {
  if (state.name.length > MAX_NAME_LENGTH) return `${MAX_NAME_LENGTH} letters at most.`
  if (!state.nameValid) return 'Your blob needs a name.'
  return ''
}
