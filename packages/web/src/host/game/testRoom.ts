import { PALETTE } from './constants.js'
import { applyMessage, type ApplyResult } from './apply.js'
import type { GameState } from './state.js'

/** Tests only: joins in the first free colour and returns any refusal untouched. */
export function joinPlayer(state: GameState, playerId: string, name: string): ApplyResult {
  return applyMessage(state, { type: 'join', playerId, name, colour: freeColour(state) })
}

export function freeColour(state: GameState): string {
  const worn = new Set([...state.players.values()].map((player) => player.colour))
  return PALETTE.find((colour) => !worn.has(colour)) ?? ''
}
