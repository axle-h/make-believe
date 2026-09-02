import { normaliseName, type ServerToHostMessage } from '@make-believe/shared'
import { BUBBLE_MS } from './constants.js'
import { observeMessage } from './objectives/director.js'
import { colourForSlot, nextFreeSlot, spawnPosition, type GameState, type Player } from './state.js'

/**
 * Everything the world hears from a phone, applied to the state. The state is
 * mutated in place and the result says what happened, so the host can answer a
 * join and the renderer can react to a new blob.
 *
 * Nothing here asks what the world is doing first: the session is one
 * continuous game, so every message is welcome whenever it arrives. The
 * running objective is *offered* each message afterwards — that is how "say
 * the word" and "draw it" will watch — but it never gets a veto: what a phone
 * sends always lands, whatever the world happens to be asking for.
 */

/** A message about somebody the world has never heard of. */
export type IgnoredReason = 'unknown-player'

export type ApplyResult =
  | { applied: true; kind: 'joined' | 'rejoined'; player: Player }
  | { applied: true; kind: 'input' | 'away' | 'text' | 'drawing'; player: Player }
  | { applied: false; reason: IgnoredReason }

export function applyMessage(state: GameState, message: ServerToHostMessage): ApplyResult {
  const result = route(state, message)
  if (result.applied) observeMessage(state, message)
  return result
}

function route(state: GameState, message: ServerToHostMessage): ApplyResult {
  switch (message.type) {
    case 'join':
      return join(state, message.playerId, message.name)
    case 'input':
      return input(state, message.playerId, message.dx, message.dy)
    case 'left':
      return left(state, message.playerId)
    case 'text':
      return text(state, message.playerId, message.value)
    case 'drawing':
      return drawing(state, message.playerId, message.png)
  }
}

/**
 * A phone said hello. A `playerId` the world already knows keeps its blob,
 * colour, slot and position — which is what makes a refresh on the phone a
 * non-event — and only takes the new name. Anyone else gets a fresh blob.
 *
 * This is also how a blob is renamed: a phone that wants a new name says hello
 * again with it, and the blob it already has takes it.
 */
function join(state: GameState, playerId: string, rawName: string): ApplyResult {
  // The schema has already refused a blank name; tidy it for the label.
  const name = normaliseName(rawName)
  const existing = state.players.get(playerId)
  if (existing) {
    existing.name = name
    existing.away = false
    existing.awayForMs = 0
    return { applied: true, kind: 'rejoined', player: existing }
  }
  const slot = nextFreeSlot(state)
  const { x, y } = spawnPosition(state, slot)
  const player: Player = {
    playerId,
    name,
    slot,
    colour: colourForSlot(slot),
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

/**
 * Somebody said something. A bubble goes up over their blob and `tick` takes
 * it down again; a second message replaces the first rather than queueing.
 * Sending nothing at all takes the bubble down early.
 *
 * There is no round to be in and no wrong moment for it: half the fun is
 * shouting something while everyone is running about.
 */
function text(state: GameState, playerId: string, value: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  const said = value.trim()
  player.bubble = said.length === 0 ? null : { text: said, remainingMs: BUBBLE_MS }
  return { applied: true, kind: 'text', player }
}

/**
 * Somebody drew something. The drawing becomes the blob's skin, under a key
 * the renderer turns into a texture. Each one gets its own key so the renderer
 * can tell a new drawing from the one already on screen — which is what lets a
 * blob be redrawn as often as its owner likes.
 */
function drawing(state: GameState, playerId: string, png: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  player.skinCount += 1
  player.skin = { key: `skin-${playerId}-${player.skinCount}`, png }
  return { applied: true, kind: 'drawing', player }
}

/** Steer a blob the world knows about. Input from a stranger is ignored. */
function input(state: GameState, playerId: string, dx: number, dy: number): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  // A phone whose blob is marked away is plainly back; let it drive again.
  player.away = false
  player.awayForMs = 0
  player.dx = dx
  player.dy = dy
  return { applied: true, kind: 'input', player }
}

/**
 * The phone went away. The blob stays put, holding its slot, colour, name and
 * position, so that a refresh — or a rejoin from the same phone — walks back
 * into the same blob. `tick` clears it out if nobody comes back.
 */
function left(state: GameState, playerId: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  player.away = true
  player.awayForMs = 0
  player.dx = 0
  player.dy = 0
  return { applied: true, kind: 'away', player }
}
