import {
  HostToPlayerMessageSchema,
  MAX_TEXT_LENGTH,
  isValidRoomCode,
  normaliseRoomCode,
  type HostToPlayerMessage,
  type PlayerToHostMessage,
} from '@make-believe/shared'
import { connect, type WsClient } from '../lib/ws.js'
import {
  CANVAS_SIZE,
  CRAYONS,
  STROKE_WIDTH,
  cornerRadius,
  isSendablePng,
  pointerToCanvas,
} from './drawing.js'
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

/**
 * How often a phone that is waiting knocks on the TV's door. A TV that has
 * just reloaded keeps the phones' sockets (the relay does not drop them when
 * the code is unchanged) but knows nothing about them, so the phone has to say
 * hello again of its own accord.
 */
const KNOCK_MS = 2_000

/** How long "Sent" stays under the box before it clears itself. */
const SENT_MS = 1_500

type Screen = 'join' | 'waiting' | 'play' | 'text' | 'draw'

const screens: Record<Screen, HTMLElement> = {
  join: requireElement<HTMLElement>('#screen-join'),
  waiting: requireElement<HTMLElement>('#screen-waiting'),
  play: requireElement<HTMLElement>('#screen-play'),
  text: requireElement<HTMLElement>('#screen-text'),
  draw: requireElement<HTMLElement>('#screen-draw'),
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
const textForm = requireElement<HTMLFormElement>('#text-form')
const textInput = requireElement<HTMLInputElement>('#text-input')
const textCount = requireElement<HTMLElement>('#text-count')
const textSend = requireElement<HTMLButtonElement>('#text-send')
const textSent = requireElement<HTMLElement>('#text-sent')
const drawCanvas = requireElement<HTMLCanvasElement>('#draw-canvas')
const drawCrayons = requireElement<HTMLElement>('#draw-crayons')
const drawClear = requireElement<HTMLButtonElement>('#draw-clear')
const drawDone = requireElement<HTMLButtonElement>('#draw-done')
const drawStatus = requireElement<HTMLElement>('#draw-status')
const linkStatus = requireElement<HTMLElement>('#link-status')

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
if (isValidRoomCode(roomFromUrl)) {
  roomInput.value = roomFromUrl
  // Scanned the TV: the only thing left to do is say who you are.
  nameInput.focus()
} else if (isValidRoomCode(roomFromStorage)) {
  roomInput.value = roomFromStorage
}

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
      linkStatus.hidden = status === 'open'
      if (status !== 'open') return
      retryMs = FIRST_WAIT_RETRY_MS
      sendMessage({ type: 'join', playerId, name })
      keepAwake()
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
    blobColour = message.colour
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
    return
  }
  if (message.value === 'text') {
    // Whatever the thumb was doing, the blob stops when the round changes.
    release()
    showScreen('text')
    return
  }
  if (message.value === 'draw') {
    release()
    showScreen('draw')
  }
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

/**
 * Knock on the TV's door while waiting for it. Costs one small message every
 * couple of seconds and nothing at all when there is no session or no socket.
 */
setInterval(() => {
  if (screen !== 'waiting' || !session) return
  sendMessage({ type: 'join', playerId, name: session.name })
}, KNOCK_MS)

// --- keeping the screen on -----------------------------------------------

let wakeLock: WakeLockSentinel | null = null

/**
 * A controller that goes to sleep mid-game is no fun. Wake Lock needs a secure
 * context, so on a plain-http LAN this quietly does nothing until phase 8 puts
 * HTTPS in front of it.
 */
function keepAwake(): void {
  if (wakeLock) return
  navigator.wakeLock
    ?.request('screen')
    .then((sentinel) => {
      wakeLock = sentinel
      sentinel.addEventListener('release', () => {
        wakeLock = null
      })
    })
    .catch(() => {
      // Not available, or refused because the page is not visible.
    })
}

function letSleep(): void {
  void wakeLock?.release()
  wakeLock = null
}

// A lock is dropped whenever the phone is backgrounded; take it again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session) keepAwake()
})

/** Give up on the current session entirely. */
function stop(): void {
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  retryMs = FIRST_WAIT_RETRY_MS
  client?.close()
  client = null
  session = null
  letSleep()
}

function sendMessage(message: PlayerToHostMessage): void {
  client?.send(message)
}

function showScreen(which: Screen): void {
  screen = which
  for (const [name, element] of Object.entries(screens)) element.hidden = name !== which
  if (which === 'text') openKeyboard()
  if (which === 'draw') openSketch()
}

// --- saying something ----------------------------------------------------

let sentTimer: ReturnType<typeof setTimeout> | null = null

textInput.addEventListener('input', refreshTextForm)

textForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const value = textInput.value.trim().slice(0, MAX_TEXT_LENGTH)
  if (value.length === 0) return
  sendMessage({ type: 'text', playerId, value })
  textInput.value = ''
  refreshTextForm()
  announceSent()
  // The keyboard stays up: the next thing to say is usually right behind.
  textInput.focus()
})

function refreshTextForm(): void {
  const length = textInput.value.trim().length
  textCount.textContent = `${textInput.value.length}/${MAX_TEXT_LENGTH}`
  textSend.disabled = length === 0
}

function announceSent(): void {
  textSent.textContent = 'Sent'
  if (sentTimer !== null) clearTimeout(sentTimer)
  sentTimer = setTimeout(() => {
    textSent.textContent = ''
  }, SENT_MS)
}

/**
 * Android's keyboard shrinks the viewport rather than scrolling the page, so
 * the box can end up underneath it. Ask for the keyboard, then keep the box in
 * view as the viewport changes size under it.
 */
function openKeyboard(): void {
  textSent.textContent = ''
  refreshTextForm()
  setTimeout(() => {
    textInput.focus()
    textInput.scrollIntoView({ block: 'center' })
  }, 50)
}

window.visualViewport?.addEventListener('resize', () => {
  if (screen !== 'text') return
  if (document.activeElement !== textInput) return
  textInput.scrollIntoView({ block: 'center' })
})

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

// --- drawing a blob ------------------------------------------------------

/** The colour the TV gave this blob; the drawing starts as a square of it. */
let blobColour = '#4ea8ff'
let crayon: string = CRAYONS[0]
/** The finger that is drawing, if any. */
let drawPointer: number | null = null
/** Set once the canvas has a background, so a round trip does not wipe it. */
let sketchStarted = false

const sketch = drawCanvas.getContext('2d')

for (const colour of CRAYONS) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'crayon'
  button.style.background = colour
  button.setAttribute('aria-label', colour)
  button.setAttribute('aria-pressed', String(colour === crayon))
  button.addEventListener('click', () => {
    crayon = colour
    for (const other of drawCrayons.children) {
      other.setAttribute('aria-pressed', String(other === button))
    }
  })
  drawCrayons.append(button)
}

drawClear.addEventListener('click', () => {
  paintBackground()
  drawStatus.textContent = ''
})

drawDone.addEventListener('click', sendDrawing)

drawCanvas.addEventListener('pointerdown', (event) => {
  if (!sketch) return
  event.preventDefault()
  drawPointer = event.pointerId
  try {
    drawCanvas.setPointerCapture(event.pointerId)
  } catch {
    // Some pointers cannot be captured; drawing still works without it.
  }
  const at = pointAt(event)
  sketch.strokeStyle = crayon
  sketch.beginPath()
  sketch.moveTo(at.x, at.y)
  // A tap with no drag should still leave a dot.
  sketch.lineTo(at.x, at.y)
  sketch.stroke()
})

drawCanvas.addEventListener('pointermove', (event) => {
  if (!sketch || event.pointerId !== drawPointer) return
  event.preventDefault()
  const at = pointAt(event)
  sketch.lineTo(at.x, at.y)
  sketch.stroke()
})

for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
  drawCanvas.addEventListener(type, (event) => {
    if (event.pointerId !== drawPointer) return
    drawPointer = null
    sketch?.closePath()
  })
}

function pointAt(event: PointerEvent): { x: number; y: number } {
  return pointerToCanvas(drawCanvas.getBoundingClientRect(), { x: event.clientX, y: event.clientY })
}

/** The drawing starts as a blob-shaped square of this blob's own colour. */
function paintBackground(): void {
  if (!sketch) return
  sketch.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  sketch.fillStyle = blobColour
  sketch.beginPath()
  sketch.roundRect(0, 0, CANVAS_SIZE, CANVAS_SIZE, cornerRadius())
  sketch.fill()
  sketch.lineCap = 'round'
  sketch.lineJoin = 'round'
  sketch.lineWidth = STROKE_WIDTH
  sketchStarted = true
}

function openSketch(): void {
  drawStatus.textContent = ''
  if (!sketchStarted) paintBackground()
}

/**
 * Send the drawing to the TV. A 256x256 doodle is nowhere near the size cap,
 * but a phone with a very high pixel ratio could surprise us, so an oversize
 * PNG is shrunk rather than silently dropped.
 */
function sendDrawing(): void {
  if (!sketch) return
  const png = drawCanvas.toDataURL('image/png')
  const sendable = isSendablePng(png) ? png : shrink(png)
  if (!sendable) {
    drawStatus.textContent = 'That drawing is too big to send. Try starting again.'
    return
  }
  sendMessage({ type: 'drawing', playerId, png: sendable })
  drawStatus.textContent = 'Sent to the TV'
}

/** Redraw at half size and hope that fits. Returns null if it still does not. */
function shrink(png: string): string | null {
  const half = document.createElement('canvas')
  half.width = CANVAS_SIZE / 2
  half.height = CANVAS_SIZE / 2
  const context = half.getContext('2d')
  if (!context) return null
  context.drawImage(drawCanvas, 0, 0, half.width, half.height)
  const smaller = half.toDataURL('image/png')
  return isSendablePng(smaller) ? smaller : (isSendablePng(png) ? png : null)
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
