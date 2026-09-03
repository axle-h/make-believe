import {
  MAX_NAME_LENGTH,
  isValidName,
  normaliseName,
  sameName,
  type PaletteEntry,
  type RefusedReason,
} from '@make-believe/shared'

/**
 * What the join screen thinks of what has been chosen so far, as pure
 * functions of the two things it asks for. `main.ts` does the DOM; this
 * decides whether the Join button is live, which swatches can be tapped, and
 * what to say when the world says no.
 *
 * There is nothing else to ask for. A phone reaches exactly one world — the
 * one that served it this page — and which session of it that is gets settled
 * on the socket, so a name and a colour are the whole of getting in.
 *
 * **Nothing here decides anything.** The world grants a colour and a name, and
 * every one of these functions is working from the palette it was last sent:
 * greying a swatch out is showing what the TV said, not making a rule.
 */

export interface JoinFormState {
  /** The name as it will go on the wire. */
  name: string
  nameValid: boolean
  /** The colour picked, or `null` while nothing is. */
  colour: string | null
  canJoin: boolean
}

export function evaluateJoinForm(rawName: string, colour: string | null): JoinFormState {
  const name = normaliseName(rawName)
  const nameValid = isValidName(name)
  return { name, nameValid, colour, canJoin: nameValid && colour !== null }
}

/** One swatch on the join screen. */
export interface Swatch extends PaletteEntry {
  /** False when somebody already has it: greyed, with their name under it. */
  free: boolean
}

export interface ColourChoice {
  colours: Swatch[]
  /**
   * The one that should be selected, or `null` for none. It is the colour
   * wanted, if it is still going.
   */
  chosen: string | null
  /** Every colour is somebody else's: ten blobs are already out playing. */
  full: boolean
}

/**
 * The row of swatches, and which of them is selected.
 *
 * `wanted` is what this phone is after — the colour it had last time, or the
 * one just tapped. A wanted colour that has gone selects **nothing** rather
 * than the next one along: a colour is chosen by a child, and one that appeared
 * under a resting thumb is worse than an empty row. The same rule works the
 * other way round — a swatch going free simply goes live, and waits to be
 * tapped.
 */
export function choosableColours(palette: PaletteEntry[], wanted: string | null): ColourChoice {
  const colours = palette.map((entry) => ({ ...entry, free: entry.takenBy === null }))
  const free = colours.filter((swatch) => swatch.free)
  const still = free.some((swatch) => swatch.hex === wanted)
  return {
    colours,
    chosen: still ? wanted : null,
    full: colours.length > 0 && free.length === 0,
  }
}

/** What a phone says about a name somebody else already has. */
export const TAKEN_NAME = 'Somebody is already called that.'

/**
 * Whether this name is one of the names already on the floor. The world
 * refuses it either way — it is the only thing that decides — but a join
 * screen that can say so while it is being typed saves a child a refusal.
 */
export function nameTaken(palette: PaletteEntry[], name: string): boolean {
  return palette.some((entry) => entry.takenBy !== null && sameName(entry.takenBy, name))
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
  if (state.colour === null) return 'Pick a colour for your blob.'
  return ''
}

/**
 * What the world said when it would not let this phone in, in words for
 * whoever is holding it. The reason comes from the TV; the sentence is built
 * here out of the palette that came with it, which is where the name of
 * whoever took the colour is.
 */
export function refusalMessage(
  reason: RefusedReason,
  palette: PaletteEntry[],
  wanted: string | null,
): string {
  if (reason === 'full') return 'All ten blobs are out playing. Wait for one to finish!'
  if (reason === 'name') return TAKEN_NAME
  const taken = palette.find((entry) => entry.hex === wanted)?.takenBy
  return taken ? `${taken} has that one now.` : 'Somebody took that colour.'
}
