import {
  HostToPlayerMessageSchema,
  isValidRoomCode,
  normaliseRoomCode,
  type HostToPlayerMessage,
  type PlayerToHostMessage,
} from '@make-believe/shared'
import { connect, type WsClient } from '../lib/ws.js'
import { evaluateJoinForm, joinFormError } from './joinForm.js'
import { ZERO, createInputThrottle, vectorFromPointer, type Vector } from './joystick.js'
import './player.css'

/**
 * The phone. It is a dumb controller: it sends inputs and does what the TV
 * tells it. No game state lives here.
 */

const PLAYER_ID_KEY = 'make-believe.playerId'
const NAME_KEY = 'make-believe.name'
const ROOM_KEY = 'make-believe.room'

/** How long to wait before trying the TV again while it is away. */
const FIRST_WAIT_RETRY_MS = 800
const MAX_WAIT_RETRY_MS = 4_000

type Screen = 'join' | 'waiting' | 'play'

const screens: Record<Screen, HTMLElement> = {
  join: requireElement<HTMLElement>('#screen-join'),
  waiting: requireElement<HTMLElement>('#screen-waiting'),
  play: requireElement<HTMLElement>('#screen-play'),
}
const joinForm = requireElement<HTMLFormElement>('#join-form')
const roomInput = requireElement<HTMLInputElement>('#room-input')
const nameInput = requireElement<HTMLInputElement>('#name-input')
const joinButton = requireElement<HTMLButtonElement>('#join-button')
const joinError = requireElement<HTMLElement>('#join-error')
const waitingCode = requireElement<HTMLElement>('#waiting-code')
const waitingName = requireElement<HTMLElement>('#waiting-name')
const changeCodeButton = requireElement<HTMLButtonElement>('#change-code-button')
const playStatus = requireElement<HTMLElement>('#play-status')
const pad = requireElement<HTMLElement>('#pad')
const thumb = requireElement<HTMLElement>('#thumb')

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`the player page needs ${selector}`)
  return element
}

const playerId = loadPlayerId()
const throttle = createInputThrottle()

let client: WsClient | null = null
/** What we joined with, so a retry can use the same thing. */
let session: { room: string; name: string } | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryMs = FIRST_WAIT_RETRY_MS
let screen: Screen = 'join'
/** The pointer holding the pad down, if any. */
let activePointer: number | null = null
/** Where the thumb is right now; the send loop drains it. */
let latest: Vector = ZERO

// --- the join screen -----------------------------------------------------

nameInput.value = loadStored(NAME_KEY) ?? ''

// Scanning the QR code (phase 6) or following the link on the TV fills the code
// in; failing that, the code from last time, so a refresh asks for nothing.
const roomFromUrl = normaliseRoomCode(new URLSearchParams(window.location.search).get('room') ?? '')
const roomFromStorage = normaliseRoomCode(loadStored(ROOM_KEY) ?? '')
if (isValidRoomCode(roomFromUrl)) roomInput.value = roomFromUrl
else if (isValidRoomCode(roomFromStorage)) roomInput.value = roomFromStorage

refreshJoinButton()
for (const input of [roomInput, nameInput]) {
  input.addEventListener('input', () => {
    joinError.textContent = ''
    refreshJoinButton()
  })
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault()
  submitJoin()
})

changeCodeButton.addEventListener('click', () => {
  stop()
  showScreen('join')
  joinError.textContent = ''
})

function refreshJoinButton(): void {
  joinButton.disabled = !evaluateJoinForm(roomInput.value, nameInput.value).canJoin
}

function submitJoin(): void {
  const state = evaluateJoinForm(roomInput.value, nameInput.value)
  roomInput.value = state.room
  if (!state.canJoin) {
    joinError.textContent = joinFormError(state)
    return
  }
  joinError.textContent = ''
  store(NAME_KEY, state.name)
  store(ROOM_KEY, state.room)
  session = { room: state.room, name: state.name }
  waitingCode.textContent = state.room
  waitingName.textContent = state.name
  showScreen('waiting')
  openSocket()
}

// --- the connection ------------------------------------------------------

/** Open a socket for the current session. The TV decides what happens next. */
function openSocket(): void {
  if (!session) return
  const { room, name } = session
  client?.close()
  client = connect({
    query: { role: 'player', room, playerId },
    schema: HostToPlayerMessageSchema,
    onMessage: applyMessage,
    onStatus: (status) => {
      if (status === 'open') {
        retryMs = FIRST_WAIT_RETRY_MS
        sendMessage({ type: 'join', playerId, name })
      } else if (status === 'closed' && screen === 'play') {
        playStatus.textContent = 'Lost the TV — retrying…'
      }
    },
    onFatal: ({ reason }) => {
      // The relay hung up for good. A TV that is not there yet is worth
      // waiting for; anything else means this code will never work.
      if (reason === 'no-host') {
        retryLater()
        return
      }
      stop()
      showScreen('join')
      joinError.textContent =
        reason === 'wrong-room' ? 'The TV has a new code now.' : 'The TV would not let that in.'
    },
  })
}

function applyMessage(message: HostToPlayerMessage): void {
  if (message.type === 'assigned') {
    document.documentElement.style.setProperty('--blob', message.colour)
    playStatus.textContent = session?.name ?? ''
    return
  }
  if (message.value === 'lobby') {
    // The TV has gone. The relay hangs up right behind this message, so the
    // close handler is what decides whether to wait or ask for a new code.
    // Closing the socket here instead would throw that reason away.
    release()
    showScreen('waiting')
    return
  }
  if (message.value === 'play') {
    showScreen('play')
    playStatus.textContent = session?.name ?? ''
  }
  // 'draw' and 'text' get their own screens in phases 5 and 4.
}

/** Sit on the waiting screen and knock again shortly, until the TV answers. */
function retryLater(): void {
  if (!session) return
  client?.close()
  client = null
  release()
  showScreen('waiting')
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = setTimeout(openSocket, retryMs)
  retryMs = Math.min(retryMs * 2, MAX_WAIT_RETRY_MS)
}

/** Give up on the current session entirely. */
function stop(): void {
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  retryMs = FIRST_WAIT_RETRY_MS
  client?.close()
  client = null
  session = null
}

function sendMessage(message: PlayerToHostMessage): void {
  client?.send(message)
}

function showScreen(which: Screen): void {
  screen = which
  for (const [name, element] of Object.entries(screens)) element.hidden = name !== which
}

// --- identity ------------------------------------------------------------

function loadPlayerId(): string {
  const stored = loadStored(PLAYER_ID_KEY)
  if (stored) return stored
  const created = createPlayerId()
  store(PLAYER_ID_KEY, created)
  return created
}

function createPlayerId(): string {
  // randomUUID needs a secure context, and on the LAN we are plain http.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function loadStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Private browsing, or storage turned off: nothing is remembered.
    return null
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Nothing to do; the blob just will not survive a refresh.
  }
}

// --- the joystick --------------------------------------------------------

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
  activePointer = null
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

// A remembered name and a code, from the QR link or from last time, means there
// is nothing to ask. Last, so every handler above is wired before it can fire.
if (evaluateJoinForm(roomInput.value, nameInput.value).canJoin) submitJoin()
