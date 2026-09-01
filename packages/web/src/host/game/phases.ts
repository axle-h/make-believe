import type { PhaseValue } from '@make-believe/shared'
import type { GameState } from './state.js'

/**
 * Which phase may follow which. `play` is the hub: the lobby leads into the
 * game, and the text and drawing rounds are things the game drops into and
 * comes back from. Nothing may jump straight from the lobby into a round.
 */
const LEGAL_TRANSITIONS: Record<PhaseValue, readonly PhaseValue[]> = {
  lobby: ['play'],
  play: ['lobby', 'text', 'draw'],
  text: ['play', 'lobby'],
  draw: ['play', 'lobby'],
}

export function canEnterPhase(from: PhaseValue, to: PhaseValue): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

export type PhaseChange =
  | { changed: true; from: PhaseValue; to: PhaseValue }
  | { changed: false; reason: 'same-phase' | 'illegal' }

/**
 * Move the world into another phase. An illegal move is ignored and says so,
 * rather than throwing: the host UI can then leave the world alone.
 */
export function setPhase(state: GameState, to: PhaseValue): PhaseChange {
  const from = state.phase
  if (from === to) return { changed: false, reason: 'same-phase' }
  if (!canEnterPhase(from, to)) return { changed: false, reason: 'illegal' }
  state.phase = to
  return { changed: true, from, to }
}
