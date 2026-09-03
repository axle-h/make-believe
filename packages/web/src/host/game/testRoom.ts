import { PALETTE } from './constants.js'
import { applyMessage, type ApplyResult } from './apply.js'
import type { GameState } from './state.js'

/**
 * A blob, joined the way a phone joins one — for tests only.
 *
 * A hello has to ask for a colour, because a child picks one; every test that
 * wants a room of blobs would otherwise have to hand out ten distinct colours
 * itself, and a test that got that wrong would look like a broken game rather
 * than a broken test. So this takes the first colour nobody is wearing, which
 * is what the world used to do before children chose for themselves.
 *
 * Nothing in the game calls it. The one thing it must not do is paper over a
 * refusal: the result comes straight back, so a test about being refused can
 * still be written with it.
 */
export function joinPlayer(state: GameState, playerId: string, name: string): ApplyResult {
  return applyMessage(state, { type: 'join', playerId, name, colour: freeColour(state) })
}

/** The first colour in the palette nobody has. `''` once they have all gone. */
export function freeColour(state: GameState): string {
  const worn = new Set([...state.players.values()].map((player) => player.colour))
  return PALETTE.find((colour) => !worn.has(colour)) ?? ''
}
