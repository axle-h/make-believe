import { normaliseName, type RefusedReason, type ServerToHostMessage } from '@make-believe/shared'
import type { Rgb } from './colour.js'
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

/**
 * Why a hello was not granted: the colour has gone, the name is somebody
 * else's, or there are already as many blobs as there are colours. All three
 * send the phone back to its join screen to pick again; none of them is a
 * queue, except the eleventh phone, which is waiting for a physical thing
 * rather than for a turn.
 */
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

/**
 * A phone said hello, asking to be called something and to be a colour.
 *
 * A `playerId` the world already knows keeps its blob, colour, slot, name and
 * position — which is what makes a refresh on the phone a non-event, and why
 * it is exempt from both checks below: a blob may not be refused its own name
 * or its own colour.
 *
 * Anybody else has to ask for a colour nobody is wearing and a name nobody is
 * called, and there have to be fewer than ten blobs already. The world decides
 * all three; the phone only shows what it was told.
 *
 * The name comes off the hello every time rather than only the first: the
 * hello is what a phone says on every reconnect, and it is the only thing that
 * knows what its child is called.
 */
function join(state: GameState, playerId: string, rawName: string, colour: string): ApplyResult {
  // The schema has already refused a blank name; tidy it for the label.
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
  // Ten colours is ten blobs. The eleventh phone waits with its name typed and
  // gets in the moment somebody quits, which is a physical limit rather than a
  // turn: nobody who is already in ever waits for anything.
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
  player.skin = { key: `skin-${playerId}-${player.skinCount}`, png, average: null }
  return { applied: true, kind: 'drawing', player }
}

/**
 * What colour a drawing turned out, from whoever decoded it. This is the one
 * thing that comes into the model from the renderer rather than from a phone:
 * reading pixels needs a canvas, so the Phaser layer samples the texture it is
 * already building and hands back a single colour.
 *
 * It is keyed by the drawing rather than the blob, because a child who redraws
 * twice in a second has two decodes in flight and the older one must not land
 * on the newer picture.
 */
export function noteSkinColour(
  state: GameState,
  playerId: string,
  key: string,
  average: Rgb,
): boolean {
  const skin = state.players.get(playerId)?.skin
  if (!skin || skin.key !== key) return false
  skin.average = average
  return true
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
 * Somebody has finished. This is the one thing a phone can ask the world to
 * undo, and it undoes the lot: the blob goes, and its name, its picture and
 * its place on the floor go with it. Nothing is answered, because the phone
 * has already forgotten it too and is asking its child for a name again.
 *
 * It is deliberately not `left`. A phone that has merely gone quiet leaves a
 * blob standing there waiting for it; a child who has finished does not want
 * to come back to the one they had.
 */
function finish(state: GameState, playerId: string): ApplyResult {
  const player = state.players.get(playerId)
  if (!player) return { applied: false, reason: 'unknown-player' }
  state.players.delete(playerId)
  // Everything the world was holding for this blob goes with it, including
  // the crown: a title on a head that is not on the floor is not one anybody
  // can come and take.
  forgetPlayer(state, playerId)
  return { applied: true, kind: 'finished', player }
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
