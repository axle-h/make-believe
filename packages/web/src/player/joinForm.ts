import {
  MAX_NAME_LENGTH,
  isValidName,
  normaliseName,
  sameName,
  type PaletteEntry,
  type RefusedReason,
} from '@make-believe/shared'

// Nothing here decides anything: the world grants a colour and a name, and a greyed swatch only
// shows the palette the TV last sent.

export interface JoinFormState {
  name: string
  nameValid: boolean
  colour: string | null
  canJoin: boolean
}

export function evaluateJoinForm(rawName: string, colour: string | null): JoinFormState {
  const name = normaliseName(rawName)
  const nameValid = isValidName(name)
  return { name, nameValid, colour, canJoin: nameValid && colour !== null }
}

export interface Swatch extends PaletteEntry {
  free: boolean
}

export interface ColourChoice {
  colours: Swatch[]
  chosen: string | null
  full: boolean
}

/** A wanted colour that has gone selects nothing rather than the next one along. */
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

export const TAKEN_NAME = 'Somebody is already called that.'

/** The world refuses a taken name anyway; this only lets the screen say so while it is typed. */
export function nameTaken(palette: PaletteEntry[], name: string): boolean {
  return palette.some((entry) => entry.takenBy !== null && sameName(entry.takenBy, name))
}

/** A pasted name can pass the box's cap, so length gets its own sentence. */
export function joinFormError(state: JoinFormState): string {
  if (state.name.length > MAX_NAME_LENGTH) return `${MAX_NAME_LENGTH} letters at most.`
  if (!state.nameValid) return 'Your blob needs a name.'
  if (state.colour === null) return 'Pick a colour for your blob.'
  return ''
}

/** The reason comes from the TV; whose colour it is comes from the palette. */
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
