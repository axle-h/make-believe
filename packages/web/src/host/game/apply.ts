import { normaliseName, type RefusedReason, type ServerToHostMessage } from '@make-believe/shared'
import { BUBBLE_MS, MAX_BLOBS } from './constants.js'
import { forgetPlayer, observeMessage } from './objectives/director.js'
import {
  claimColour,
  namedAs,
  nextFreeSlot,
  spawnPosition,
  type GameState,
  type Player,
} from './state.js'

/**
 * The running objective is offered each message only after it lands and never gets a veto:
 * a task changes what the world asks for, never what a phone may do.
 */

export type IgnoredReason = 'unknown-player'

export type ApplyResult =
  | { applied: true; kind: 'joined' | 'rejoined'; player: Player }
  | { applied: true; kind: 'input' | 'away' | 'text' | 'drawing'; player: Player }
  | { applied: true; kind: 'finished'; player: Player }
  | { applied: false; reason: IgnoredReason }
  | { applied: false; refused: RefusedReason; playerId: string }

export function applyMessage(state: GameState, message: ServerToHostMessage): ApplyResult {
  const result = route(state, message)
  if (result.applied) observeMessage(state, message)
  return result
}

function route(state: GameState, message: ServerToHostMessage): ApplyResult {
  switch (message.type) {
    case 'join':
      return join(state, message.playerId, message.name, message.colour)
    case 'input':
      return input(state, message.playerId, message.dx, message.dy)
    case 'finish':
      return finish(state, message.playerId)
    case 'left':
      return left(state, message.playerId)
    case 'text':
      return text(state, message.playerId, message.value)
    case 'drawing':
      return drawing(state, message.playerId, message.png)
  }
}

/** A known `playerId` keeps its blob and is never refused its own name or colour. */
function join(state: GameState, playerId: string, rawName: string, colour: string): ApplyResult {
  const name = normaliseName(rawName)
  const existing = state.players.get(playerId)
  if (existing) {
    const other = namedAs(state, name)
    if (other && other !== existing) return { applied: false, refused: 'name', playerId }
    existing.name = name
    existing.away = false
    existing.awayForMs = 0
    return { applied: true, kind: 'rejoined', player: existing }
  }
  // The only queue in the game, and a physical limit rather than a turn.
  if (state.players.size >= MAX_BLOBS) return { applied: false, refused: 'full', playerId }
  if (namedAs(state, name)) return { applied: false, refused: 'name', playerId }
  if (!claimColour(state, colour)) return { applied: false, refused: 'colour', playerId }

  const slot = nextFreeSlot(state)
  const { x, y } = spawnPosition(state, slot)
  const player: Player = {
    playerId,
    name,
    slot,
    colour,
    x,
    y,
    dx: 0,
    dy: 0,
    away: false,
    awayForMs: 0,
    bubble: null,
    skin: null,
    skinCount: 0,
  }
  state.players.set(playerId, player)
  return { applied: true, kind: 'joined', player }
}

/** A second message replaces the first rather than queueing; an empty one takes the bubble down. */
function text(state: GameState, playerId: string, value: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  const said = value.trim()
  player.bubble = said.length === 0 ? null : { text: said, remainingMs: BUBBLE_MS }
  return { applied: true, kind: 'text', player }
}

/** A fresh key per drawing, so the renderer can tell a redraw from the one on screen. */
function drawing(state: GameState, playerId: string, png: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  player.skinCount += 1
  player.skin = { key: `skin-${playerId}-${player.skinCount}`, png }
  return { applied: true, kind: 'drawing', player }
}

function input(state: GameState, playerId: string, dx: number, dy: number): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  // An away blob that sends input is plainly back.
  player.away = false
  player.awayForMs = 0
  player.dx = dx
  player.dy = dy
  return { applied: true, kind: 'input', player }
}

/** The one thing a phone can undo, and it undoes the lot, crown included; nothing is sent back. */
function finish(state: GameState, playerId: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  state.players.delete(playerId)
  forgetPlayer(state, playerId)
  return { applied: true, kind: 'finished', player }
}

/** Unlike `finish`, the blob keeps everything so a reconnect walks back into it; `tick` forgets it later. */
function left(state: GameState, playerId: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  player.away = true
  player.awayForMs = 0
  player.dx = 0
  player.dy = 0
  return { applied: true, kind: 'away', player }
}
