import {
  HostToPlayerMessageSchema,
  isValidRoomCode,
  normaliseRoomCode,
  type HostToPlayerMessage,
  type PlayerToHostMessage,
} from '@make-believe/shared'
import { connect, type WsClient } from '../lib/ws.js'
import { ZERO, createInputThrottle, vectorFromPointer, type Vector } from './joystick.js'
import './player.css'

/**
 * The phone. It is a dumb controller: it sends inputs and does what the TV
 * tells it. No game state lives here.
 */

const PLAYER_ID_KEY = 'make-believe.playerId'
/** Phase 2 puts a real name here. */
const PLACEHOLDER_NAME = 'Blob'

const joinScreen = requireElement<HTMLElement>('#screen-join')
const playScreen = requireElement<HTMLElement>('#screen-play')
const joinForm = requireElement<HTMLFormElement>('#join-form')
const roomInput = requireElement<HTMLInputElement>('#room-input')
const joinError = requireElement<HTMLElement>('#join-error')
const playStatus = requireElement<HTMLElement>('#play-status')
const pad = requireElement<HTMLElement>('#pad')
const thumb = requireElement<HTMLElement>('#thumb')

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`the player page needs ${selector}`)
  return element
}

const playerId = loadPlayerId()
let client: WsClient | null = null
const throttle = createInputThrottle()

// Scanning the QR code (phase 6) or following the link on the TV fills the code in.
const roomFromUrl = normaliseRoomCode(new URLSearchParams(window.location.search).get('room') ?? '')
if (isValidRoomCode(roomFromUrl)) {
  roomInput.value = roomFromUrl
  join(roomFromUrl)
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const code = normaliseRoomCode(roomInput.value)
  roomInput.value = code
  if (!isValidRoomCode(code)) {
    joinError.textContent = 'That is not a code from the TV.'
    return
  }
  joinError.textContent = ''
  join(code)
})

function join(room: string): void {
  client?.close()
  showScreen('play')
  playStatus.textContent = 'Connecting…'
  client = connect({
    query: { role: 'player', room, playerId },
    schema: HostToPlayerMessageSchema,
    onMessage: applyMessage,
    onStatus: (status) => {
      if (status === 'open') {
        playStatus.textContent = 'Waiting for the TV…'
        sendMessage({ type: 'join', playerId, name: PLACEHOLDER_NAME })
      } else if (status === 'connecting') {
        playStatus.textContent = 'Connecting…'
      } else {
        playStatus.textContent = 'Lost the TV — retrying…'
      }
    },
  })
}

function applyMessage(message: HostToPlayerMessage): void {
  if (message.type === 'assigned') {
    document.documentElement.style.setProperty('--blob', message.colour)
    playStatus.textContent = `You are blob ${message.slot + 1}`
    return
  }
  if (message.value === 'lobby') {
    // The TV has gone, or this code is stale. Back to the code screen.
    client?.close()
    client = null
    showScreen('join')
    joinError.textContent = 'Waiting for the TV. Enter the code again when it is back.'
  }
}

function sendMessage(message: PlayerToHostMessage): void {
  client?.send(message)
}

function showScreen(which: 'join' | 'play'): void {
  joinScreen.hidden = which !== 'join'
  playScreen.hidden = which !== 'play'
}

function loadPlayerId(): string {
  try {
    const stored = window.localStorage.getItem(PLAYER_ID_KEY)
    if (stored) return stored
  } catch {
    // Private browsing, or storage turned off: a fresh id each load will do.
  }
  const created = createPlayerId()
  try {
    window.localStorage.setItem(PLAYER_ID_KEY, created)
  } catch {
    // Nothing to do; the blob just will not survive a refresh.
  }
  return created
}

function createPlayerId(): string {
  // randomUUID needs a secure context, and on the LAN we are plain http.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

// --- the joystick --------------------------------------------------------

let activePointer: number | null = null
/** Where the thumb is right now; the send loop below drains it. */
let latest: Vector = ZERO

pad.addEventListener('pointerdown', (event) => {
  activePointer = event.pointerId
  try {
    pad.setPointerCapture(event.pointerId)
  } catch {
    // Some pointers cannot be captured; the pad still works without it.
  }
  aim(event)
  requestAnimationFrame(drain)
})

pad.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer) return
  aim(event)
})

for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
  pad.addEventListener(type, (event) => {
    if (event.pointerId !== activePointer) return
    activePointer = null
    release()
  })
}

function aim(event: PointerEvent): void {
  event.preventDefault()
  const rect = pad.getBoundingClientRect()
  const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  latest = vectorFromPointer(centre, { x: event.clientX, y: event.clientY }, rect.width / 2)
  moveThumb(latest)
  send(latest)
}

/** Put a vector on the wire if the throttle allows it. */
function send(vector: Vector): void {
  if (!throttle.shouldSend(performance.now(), vector)) return
  sendMessage({ type: 'input', playerId, dx: vector.dx, dy: vector.dy })
}

/**
 * While the pad is held, keep sending wherever the thumb is. The pointer
 * handler alone is not enough: the throttle refuses the last move of a quick
 * flick, which would leave the blob running on a stale vector.
 */
function drain(): void {
  if (activePointer === null) return
  send(latest)
  requestAnimationFrame(drain)
}

/** Letting go must stop the blob at once, throttle or no throttle. */
function release(): void {
  latest = ZERO
  moveThumb(ZERO)
  throttle.record(performance.now(), ZERO)
  sendMessage({ type: 'input', playerId, dx: 0, dy: 0 })
}

function moveThumb(vector: Vector): void {
  const rect = pad.getBoundingClientRect()
  const reach = rect.width / 2 - rect.width * 0.19
  thumb.style.transform = `translate(${vector.dx * reach}px, ${vector.dy * reach}px)`
}
