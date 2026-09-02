import {
  ServerToHostMessageSchema,
  generateRoomCode,
  isValidRoomCode,
  type HostOutboundMessage,
  type ServerToHostMessage,
} from '@make-believe/shared'
import { connect } from '../lib/ws.js'
import { applyMessage, createGame, snapshot, type GameSnapshot, type GameState } from './game/index.js'
import { startPhaser, wornTextures } from './phaser/game.js'
import { joinUrl, qrSvg } from './qr.js'
import './host.css'

/**
 * The TV. It owns every scrap of game state: phones only ever send inputs.
 * The state itself lives in `game/`, Phaser draws it, and this file is the
 * socket and the wiring between the two.
 *
 * The TV takes no input of its own — no keys, no buttons, nothing to click. It
 * is a window onto the world and the phones run everything.
 */

const state: GameState = createGame()

declare global {
  interface Window {
    /** Test seam: the e2e suite reads the world from here rather than pixels. */
    __game?: {
      state: GameState
      snapshot: () => GameSnapshot
      /** The texture each blob is wearing on screen, keyed by `playerId`. */
      worn: () => Record<string, string>
      /** Tonight's code. It is only ever shown inside the QR code on screen. */
      roomCode: string
    }
  }
}

const world = requireElement<HTMLElement>('#world')
const statusEl = document.querySelector<HTMLElement>('#status')
const qrEl = document.querySelector<HTMLElement>('#qr')

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`the host page needs ${selector}`)
  return element
}

/**
 * The code identifies tonight's session of the one world this deployment runs.
 * It is kept for the life of the tab so that reloading the TV — which happens
 * by accident more than anyone would like — reuses the code on the phones
 * rather than sending everyone back to the join screen.
 */
const ROOM_KEY = 'make-believe.room'

function currentRoomCode(): string {
  try {
    const kept = window.sessionStorage.getItem(ROOM_KEY)
    if (isValidRoomCode(kept)) return kept
  } catch {
    // Storage turned off: a reload simply mints a new code.
  }
  const fresh = generateRoomCode()
  try {
    window.sessionStorage.setItem(ROOM_KEY, fresh)
  } catch {
    // As above.
  }
  return fresh
}

const roomCode = currentRoomCode()
const url = joinUrl(window.location.origin, roomCode)
if (qrEl) {
  // Parsed rather than assigned as HTML: the page never sets innerHTML.
  const svg = new DOMParser().parseFromString(qrSvg(url), 'image/svg+xml').documentElement
  qrEl.replaceChildren(svg)
  // The code is not written anywhere on the TV, so say it here for anything
  // that cannot see a QR code.
  qrEl.setAttribute('aria-label', `Scan to join with code ${roomCode}`)
}

const client = connect({
  query: { role: 'host', room: roomCode },
  schema: ServerToHostMessageSchema,
  onMessage: handleMessage,
  onStatus: (status) => {
    if (!statusEl) return
    statusEl.textContent =
      status === 'open' ? '' : status === 'connecting' ? 'Connecting…' : 'Lost the server — retrying…'
  },
  onFatal: ({ reason }) => {
    // Another TV opened the host page and took the world. This one steps
    // aside rather than reconnecting and fighting for it.
    if (statusEl) {
      statusEl.textContent =
        reason === 'replaced'
          ? 'Another TV has taken over. Reload this page to take it back.'
          : `The server hung up: ${reason || 'no reason given'}`
    }
  },
})

function send(message: HostOutboundMessage): void {
  client.send(message)
}

/**
 * A phone said something. The model decides what it means; the only thing the
 * TV has to answer is a hello, and the answer is which blob you are. That
 * message is also the phone's cue to put its controller up, so it goes out on
 * a rejoin as well — a phone that has just reloaded is waiting for it.
 */
function handleMessage(message: ServerToHostMessage): void {
  const result = applyMessage(state, message)
  if (!result.applied) return
  if (result.kind !== 'joined' && result.kind !== 'rejoined') return
  const { player } = result
  send({ type: 'assigned', colour: player.colour, slot: player.slot, to: player.playerId })
}

const phaser = startPhaser(world, state)
window.__game = {
  state,
  snapshot: () => snapshot(state),
  worn: () => wornTextures(phaser),
  roomCode,
}
