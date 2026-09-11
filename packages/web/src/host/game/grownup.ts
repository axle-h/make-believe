import { MAX_LEVEL } from './constants.js'
import { askFor, restartLadder } from './objectives/director.js'
import { findTemplate, TEMPLATES } from './objectives/registry.js'
import { activePlayers } from './selectors.js'
import type { GameState, Player } from './state.js'
import { sameName, type CommandMessage } from '@make-believe/shared'

// The host grants the grown-up's privilege to the blob it named Daddy and drops commands from any other blob,
// and the socket rather than the payload decides who is speaking. The word lives here in the host, not in
// `shared`, so it never ships to a phone. It is a secret from the children, and the secret is the whole of the protection.

const GROWNUP_NAME = 'Daddy'

export function isDaddy(name: string): boolean {
  return sameName(name, GROWNUP_NAME)
}

export function grownup(state: GameState): Player | undefined {
  return activePlayers(state).find((player) => isDaddy(player.name))
}

export interface GrownupTask {
  kind: string
  title: string
  playable: boolean
}

/** `playable` is exactly what `askFor` accepts, a headcount that ignores `suits`, or the menu would lie. */
export function grownupTasks(state: GameState): GrownupTask[] {
  const present = activePlayers(state).length
  return TEMPLATES.map((template) => ({
    kind: template.kind,
    title: template.title,
    playable: present >= template.minPlayers,
  }))
}

export function grownupLadder(state: GameState): { level: number; maxLevel: number; score: number } {
  return { level: state.objectives.level, maxLevel: MAX_LEVEL, score: state.objectives.score }
}

/** `askFor` or `restartLadder` for Daddy's blob only; `false` means nothing happened. */
export function obeyGrownup(state: GameState, message: CommandMessage): boolean {
  const asked = state.players.get(message.playerId)
  if (!asked || !isDaddy(asked.name)) return false
  if (message.command === 'restart') {
    restartLadder(state)
    return true
  }
  const template = findTemplate(message.kind)
  if (!template) return false
  return askFor(state, template.kind)
}
