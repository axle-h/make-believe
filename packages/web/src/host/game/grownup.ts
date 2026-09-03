import { MAX_LEVEL } from './constants.js'
import { askFor, restartLadder } from './objectives/director.js'
import { findTemplate, TEMPLATES } from './objectives/registry.js'
import { activePlayers } from './selectors.js'
import type { GameState, Player } from './state.js'
import { sameName, type CommandMessage } from '@make-believe/shared'

/**
 * The grown-up's door onto the two functions the TV's `d` key already calls:
 * put up any task, or put the ladder back to the start. A blob called **Daddy**
 * gets them on its phone, which is the same debug menu reached from the sofa
 * instead of from a keyboard nobody has plugged in.
 *
 * **The host grants the privilege; the phone never claims it.** The sheet is
 * only ever sent to the blob the host itself decided was Daddy, and a command
 * from anybody else is dropped — the relay tags what a phone says with the id
 * its *socket* arrived under, so a phone cannot lie about who it is.
 *
 * **The word itself lives here, in the host, and not in `shared`** — which was
 * the obvious place and is the wrong one. The phone never asks the question:
 * it has no opinion about who Daddy is, it simply builds a sheet if a `grownup`
 * message arrives. So the name need never ship to a phone at all, and since the
 * two pages are separate Vite entries, it will not. That is the difference
 * between a secret and a secret written on the thing it opens.
 *
 * It is a living-room secret rather than a boundary: anybody who knows the name
 * can take the controls. What matters is that nothing in front of a child
 * points at it.
 */

/** Case-insensitive, because "daddy" typed in a hurry has to work. */
const GROWNUP_NAME = 'Daddy'

export function isDaddy(name: string): boolean {
  return sameName(name, GROWNUP_NAME)
}

/** The one blob the grown-up's sheet goes to, if that blob is here. */
export function grownup(state: GameState): Player | undefined {
  return activePlayers(state).find((player) => isDaddy(player.name))
}

export interface GrownupTask {
  kind: string
  title: string
  /** Whether `askFor` would accept it: a headcount, and nothing else. */
  playable: boolean
}

/**
 * Every task there is, as a sheet. `playable` is exactly `present >=
 * minPlayers`, which is precisely what `askFor` accepts — and deliberately
 * takes no account of `suits`, because `askFor` ignores that on purpose so
 * that a grown-up can look at a task out of order. A greyed row the host would
 * have accepted, or a live row it refuses, is a menu that lies.
 */
export function grownupTasks(state: GameState): GrownupTask[] {
  const present = activePlayers(state).length
  return TEMPLATES.map((template) => ({
    kind: template.kind,
    title: template.title,
    playable: present >= template.minPlayers,
  }))
}

/** Where the ladder has got to, for the top of the sheet. */
export function grownupLadder(state: GameState): { level: number; maxLevel: number; score: number } {
  return { level: state.objectives.level, maxLevel: MAX_LEVEL, score: state.objectives.score }
}

/**
 * Do what the sheet asked, if it really was the grown-up's phone that asked.
 *
 * It is the same two director functions the TV's `d` key calls, and both do
 * exactly what the director does to itself when it starts a task of its own —
 * so this is a second door onto them rather than a new way to change the
 * world. A command from a blob the host did not name Daddy is dropped without
 * a word, and so is a task nobody has ever heard of: the phone is told what it
 * may ask for and this checks anyway, because the phone decides nothing.
 *
 * `false` means nothing happened, which is all a caller needs to know.
 */
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
