import {
  ServerToHostMessageSchema,
  generateRoomCode,
  isValidRoomCode,
  type HostOutboundMessage,
  type PhaseValue,
  type ServerToHostMessage,
} from '@make-believe/shared'
import { connect } from '../lib/ws.js'
import {
  applyMessage,
  createGame,
  setPhase,
  snapshot,
  type GameSnapshot,
  type GameState,
} from './game/index.js'
import { startPhaser, wornTextures } from './phaser/game.js'
import { joinUrl, qrSvg } from './qr.js'
import './host.css'

/**
 * The TV. It owns every scrap of game state: phones only ever send inputs.
 * The state itself lives in `game/`, Phaser draws it, and this file is the
 * socket and the wiring between the two.
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
    }
  }
}

const world = requireElement<HTMLElement>('#world')
const roomCodeEl = document.querySelector<HTMLElement>('#room-code')
const joinUrlEl = document.querySelector<HTMLElement>('#join-url')
const statusEl = document.querySelector<HTMLElement>('#status')
const phaseEl = document.querySelector<HTMLElement>('#phase')
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
if (roomCodeEl) roomCodeEl.textContent = roomCode
if (joinUrlEl) joinUrlEl.textContent = window.location.origin
if (qrEl) {
  // Parsed rather than assigned as HTML: the page never sets innerHTML.
  const svg = new DOMParser().parseFromString(qrSvg(url), 'image/svg+xml').documentElement
  qrEl.replaceChildren(svg)
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
    // aside rather than reconnecting and fighting for it (D-020).
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

function handleMessage(message: ServerToHostMessage): void {
  const result = applyMessage(state, message)
  if (!result.applied) return
  if (result.kind !== 'joined' && result.kind !== 'rejoined') return

  // A phone that has just arrived needs its colour and the phase it has
  // walked into. The first one through the door also starts the game: there
  // is nothing to look at in the lobby (see docs/DECISIONS.md, D-014).
  const { player } = result
  send({ type: 'assigned', colour: player.colour, slot: player.slot, to: player.playerId })
  if (state.phase === 'lobby') enterPhase('play')
  else send({ type: 'phase', value: state.phase, to: player.playerId })
}

/** Move the world into a phase and tell every phone what to show. */
function enterPhase(value: PhaseValue): boolean {
  const change = setPhase(state, value)
  if (!change.changed) return false
  send({ type: 'phase', value: change.to, to: '*' })
  showPhase()
  return true
}

/**
 * Which phase the world is in, and the keys that change it, along the bottom
 * of the screen where it can be read from the sofa (see docs/DECISIONS.md,
 * D-017).
 */
const PHASE_KEYS: ReadonlyArray<{ key: string; value: PhaseValue }> = [
  { key: 'P', value: 'play' },
  { key: 'T', value: 'text' },
  { key: 'D', value: 'draw' },
  { key: 'L', value: 'lobby' },
]

function showPhase(): void {
  if (!phaseEl) return
  phaseEl.replaceChildren(
    ...PHASE_KEYS.map(({ key, value }) => {
      const item = document.createElement('span')
      item.className = value === state.phase ? 'phase-now' : ''
      const shortcut = document.createElement('span')
      shortcut.className = 'phase-key'
      shortcut.textContent = key
      item.append(shortcut, ` ${value}\u00a0\u00a0`)
      return item
    }),
  )
}

window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const shortcut = PHASE_KEYS.find(({ key }) => key === event.key.toUpperCase())
  if (!shortcut) return
  event.preventDefault()
  enterPhase(shortcut.value)
})

showPhase()
const phaser = startPhaser(world, state)
window.__game = { state, snapshot: () => snapshot(state), worn: () => wornTextures(phaser) }
