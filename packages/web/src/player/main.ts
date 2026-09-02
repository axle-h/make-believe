import {
  HostToPlayerMessageSchema,
  MAX_TEXT_LENGTH,
  isValidSessionCode,
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
import { isDifferentBuild, shouldReload, type Screen } from './updates.js'
import './player.css'

/**
 * The phone. It is a dumb controller: it sends inputs and does what the TV
 * tells it. No game state lives here.
 *
 * Everything a blob can do is available the whole time — drive, say something,
 * redraw itself, take a new name. There are no rounds and the TV never tells a
 * phone to switch to anything.
 */

const PLAYER_ID_KEY = 'make-believe.playerId'
const NAME_KEY = 'make-believe.name'
/**
 * The world this phone last belonged to. Nobody reads it and there is nowhere
 * to type it: it is kept only so that the next connect can tell "the same TV I
 * was just talking to" from "a world that has been replaced since".
 */
const SESSION_KEY = 'make-believe.session'
/**
 * The last drawing this phone sent. The world keeps no state across a restart,
 * so the phone is the only place a picture survives one — and it is kept in
 * storage rather than memory so that reloading the phone does not lose it
 * either.
 */
const DRAWING_KEY = 'make-believe.drawing'

/** How long to wait before trying the TV again while it is away. */
const FIRST_WAIT_RETRY_MS = 800
const MAX_WAIT_RETRY_MS = 4_000

/** How long "Sent" stays under the box before it clears itself. */
const SENT_MS = 1_500

/** What is open over the joystick, if anything. */
type Sheet = 'say' | 'draw' | 'name'

const screens: Record<Screen, HTMLElement> = {
  join: requireElement<HTMLElement>('#screen-join'),
  waiting: requireElement<HTMLElement>('#screen-waiting'),
  play: requireElement<HTMLElement>('#screen-play'),
}

const sheets: Record<Sheet, HTMLElement> = {
  say: requireElement<HTMLElement>('#sheet-say'),
  draw: requireElement<HTMLElement>('#sheet-draw'),
  name: requireElement<HTMLElement>('#sheet-name'),
}
const joinForm = requireElement<HTMLFormElement>('#join-form')
const nameInput = requireElement<HTMLInputElement>('#name-input')
const joinButton = requireElement<HTMLButtonElement>('#join-button')
const joinError = requireElement<HTMLElement>('#join-error')
const waitingName = requireElement<HTMLElement>('#waiting-name')
const playName = requireElement<HTMLElement>('#play-name')
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
const renameForm = requireElement<HTMLFormElement>('#rename-form')
const renameInput = requireElement<HTMLInputElement>('#rename-input')
const renameSave = requireElement<HTMLButtonElement>('#rename-save')
const renameStatus = requireElement<HTMLElement>('#rename-status')
const linkStatus = requireElement<HTMLElement>('#link-status')

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`the player page needs ${selector}`)
  return element
}

/**
 * Who this phone is. It survives a refresh, which is what walks a reload back
 * into the same blob — and it is thrown away and minted again the moment the
 * TV turns out to be running a different world, because an identity from a
 * world that is gone is not an identity at all.
 */
let playerId = loadPlayerId()
const throttle = createInputThrottle()

let client: WsClient | null = null
/** The name we joined with, so a retry can use the same one. */
let joined: { name: string } | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryMs = FIRST_WAIT_RETRY_MS
let screen: Screen = 'join'
/** What is open over the joystick, or `null` for the joystick itself. */
let sheet: Sheet | null = null
/** The pointer holding the pad down, if any. */
let activePointer: number | null = null
/** Where the thumb is right now; the send loop drains it. */
let latest: Vector = ZERO

// --- getting in ----------------------------------------------------------

nameInput.value = loadStored(NAME_KEY) ?? ''

/**
 * The world this phone last belonged to, or '' if it has never been in one.
 * It is only ever compared, never shown.
 */
let lastSession = loadSession()

function loadSession(): string {
  const kept = loadStored(SESSION_KEY) ?? ''
  return isValidSessionCode(kept) ? kept : ''
}

nameInput.addEventListener('input', () => {
  joinError.textContent = ''
  refreshJoinButton()
})

joinForm.addEventListener('submit', (event) => {
  event.preventDefault()
  submitJoin()
})

function refreshJoinButton(): void {
  joinButton.disabled = !evaluateJoinForm(nameInput.value).canJoin
}

/** Ask who is holding the phone. */
function askForName(note = ''): void {
  joinError.textContent = note
  refreshJoinButton()
  showScreen('join')
  nameInput.focus()
}

function submitJoin(): void {
  const state = evaluateJoinForm(nameInput.value)
  if (!state.canJoin) {
    joinError.textContent = joinFormError(state)
    return
  }
  joinError.textContent = ''
  store(NAME_KEY, state.name)
  joined = { name: state.name }
  waitingName.textContent = state.name
  showScreen('waiting')
  openSocket()
}

// --- the connection ------------------------------------------------------

/**
 * Open a socket. Nothing but the role and who we are goes in the query — which
 * world this is comes back from the relay a moment later, and until it does
 * there is nothing to say.
 */
function openSocket(): void {
  if (!joined) return
  client?.close()
  client = connect({
    query: { role: 'player', playerId },
    schema: HostToPlayerMessageSchema,
    onMessage: applyMessage,
    onStatus: (status) => {
      linkStatus.hidden = status === 'open'
      if (status !== 'open') return
      retryMs = FIRST_WAIT_RETRY_MS
      keepAwake()
      void checkForNewBuild()
    },
    onFatal: ({ reason }) => {
      // The relay hung up for good. A TV that is not there yet is worth
      // waiting for; anything else is this phone being malformed, and the only
      // cure for that is somebody starting again.
      if (reason === 'no-host') {
        retryLater()
        return
      }
      stop()
      askForName('The TV would not let that in.')
    },
  })
}

/**
 * The relay has said which world this is. If it is the one we were in, we are
 * the blob we were; if it is not, the world we belonged to is gone and this
 * phone comes back as somebody new — a fresh identity, under the same name,
 * still holding its own drawing.
 *
 * Reconnecting is what makes the new identity real: the relay tags everything
 * this phone says with the id its *socket* arrived under, so a new one has to
 * arrive on a new socket.
 */
function enterSession(code: string): void {
  const previous = lastSession
  lastSession = code
  store(SESSION_KEY, code)
  // A phone that has never been anywhere is already somebody new, so only a
  // code we held and no longer match is worth a fresh identity for.
  if (previous !== '' && previous !== code) {
    playerId = createPlayerId()
    store(PLAYER_ID_KEY, playerId)
    openSocket()
    return
  }
  sayHello()
}

/**
 * Tell the TV who this phone is. The name is read at the moment of sending
 * rather than when the socket was opened: the client reconnects on its own
 * after a blip, and a blob renamed in between would otherwise be introduced
 * under its old name and quietly renamed back.
 */
function sayHello(): void {
  if (!joined) return
  sendMessage({ type: 'join', playerId, name: joined.name })
}

/**
 * What comes down the socket. `session` says which world this is and is the
 * cue to say hello; `assigned` means "you are the blue one", and it doubles as
 * the way in, since it only ever arrives in answer to a hello and is therefore
 * proof the TV knows this phone; `waiting` means the TV has gone.
 */
function applyMessage(message: HostToPlayerMessage): void {
  if (message.type === 'session') {
    enterSession(message.session)
    return
  }
  if (message.type === 'assigned') {
    document.documentElement.style.setProperty('--blob', message.colour)
    blobColour = message.colour
    playName.textContent = joined?.name ?? ''
    if (screen !== 'play') showScreen('play')
    // A world that has never seen this blob's drawing gets it now: a TV that
    // has reloaded has forgotten every picture on it, and this phone is
    // holding the only copy of its own.
    if (!message.hasDrawing && lastDrawing) {
      sendMessage({ type: 'drawing', playerId, png: lastDrawing })
    }
    return
  }
  // The TV has gone. The relay hangs up right behind this message, so the
  // close handler is what decides whether to wait or ask for a new code.
  // Closing the socket here instead would throw that reason away.
  release()
  showScreen('waiting')
}

/** Sit on the waiting screen and try again shortly, until a TV answers. */
function retryLater(): void {
  if (!joined) return
  client?.close()
  client = null
  release()
  showScreen('waiting')
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = setTimeout(openSocket, retryMs)
  retryMs = Math.min(retryMs * 2, MAX_WAIT_RETRY_MS)
}

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
  if (document.visibilityState === 'visible' && joined) keepAwake()
})

/** Give up on the current session entirely. */
function stop(): void {
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  retryMs = FIRST_WAIT_RETRY_MS
  client?.close()
  client = null
  joined = null
  letSleep()
}

function sendMessage(message: PlayerToHostMessage): void {
  client?.send(message)
}

function showScreen(which: Screen): void {
  screen = which
  for (const [name, element] of Object.entries(screens)) element.hidden = name !== which
  // Nothing but the joystick has a sheet over it, so leaving the controller
  // takes any sheet with it.
  if (which !== 'play') closeSheet()
  // A build that arrived while someone was driving gets taken now, if this is
  // one of the screens where a reload goes unnoticed.
  reloadIfSafe()
}

// --- the tools over the joystick -----------------------------------------

for (const [name, button] of [
  ['say', requireElement<HTMLButtonElement>('#tool-say')],
  ['draw', requireElement<HTMLButtonElement>('#tool-draw')],
  ['name', requireElement<HTMLButtonElement>('#tool-name')],
] as const) {
  button.addEventListener('click', () => openSheet(name))
}

for (const selector of ['#say-close', '#draw-close', '#name-close']) {
  requireElement<HTMLButtonElement>(selector).addEventListener('click', closeSheet)
}

/**
 * Put a tool over the joystick. The blob stops first: a thumb that leaves the
 * pad to press "Say" would otherwise leave it running across the room.
 */
function openSheet(which: Sheet): void {
  release()
  sheet = which
  for (const [name, element] of Object.entries(sheets)) element.hidden = name !== which
  if (which === 'say') openKeyboard()
  if (which === 'draw') openSketch()
  if (which === 'name') openRename()
}

function closeSheet(): void {
  sheet = null
  for (const element of Object.values(sheets)) element.hidden = true
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
  if (sheet !== 'say') return
  if (document.activeElement !== textInput) return
  textInput.scrollIntoView({ block: 'center' })
})

// --- taking a new name ---------------------------------------------------

/**
 * A blob can be renamed whenever its owner fancies it. There is no message for
 * it: saying hello again with a new name is exactly what a rename is, and the
 * world already gives a `playerId` it knows its own blob back.
 */
renameForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const state = evaluateJoinForm(renameInput.value)
  if (!state.nameValid || !joined) return
  joined = { name: state.name }
  store(NAME_KEY, state.name)
  sayHello()
  nameInput.value = state.name
  playName.textContent = state.name
  renameStatus.textContent = 'Sent to the TV'
  closeSheet()
})

renameInput.addEventListener('input', () => {
  renameSave.disabled = !evaluateJoinForm(renameInput.value).nameValid
})

function openRename(): void {
  renameStatus.textContent = ''
  renameInput.value = joined?.name ?? ''
  renameSave.disabled = !evaluateJoinForm(renameInput.value).nameValid
  setTimeout(() => {
    renameInput.focus()
    renameInput.select()
  }, 50)
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

// --- drawing a blob ------------------------------------------------------

/** The colour the TV gave this blob; the drawing starts as a square of it. */
let blobColour = '#4ea8ff'
/** The last drawing sent, ready to put back on a world that has lost it. */
let lastDrawing = loadStored(DRAWING_KEY)
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
  lastDrawing = sendable
  store(DRAWING_KEY, sendable)
  // Straight back to the joystick: the drawing appearing on the blob is much
  // better proof it arrived than a line of text on the phone would be.
  closeSheet()
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

// --- being an app --------------------------------------------------------

/**
 * The phone can install the player page from Chrome's own menu, and from then
 * on it opens fullscreen from an icon. Nothing here offers that: the page has
 * one job, and a button asking to be installed is not it. Installing does make
 * keeping the page up to date our problem rather than the browser's, though —
 * nobody is going to reload an app — which is what the rest of this is for.
 */

/** The service worker registry, or null on a browser or origin without one. */
const workers = 'serviceWorker' in navigator ? navigator.serviceWorker : null

/** Whether a worker was already driving this page when it loaded. */
const hadController = Boolean(workers?.controller)

/** Set when a newer build is ready but the phone is busy with something. */
let updatePending = false

/** Set once a reload is on its way; asking twice only races the first. */
let reloading = false

workers
  ?.register(`/sw.js?v=${__BUILD_VERSION__}`, { updateViaCache: 'none' })
  .catch(() => {
    // No secure context, most likely: plain http on the LAN. The page works
    // exactly as before, it just cannot spot a deploy on its own.
  })

workers?.addEventListener('controllerchange', () => {
  // A worker claiming a page that had none is the first install, not an
  // update; there is nothing newer to go and get.
  if (!hadController) return
  // A new worker is a reason to look, not a reason to reload: it can be the
  // very build this page is already running, claiming it a moment late.
  void checkForNewBuild()
})

/** Take a waiting build now if this is a moment where nobody would notice. */
function reloadIfSafe(): void {
  if (reloading || !shouldReload(screen, updatePending)) return
  reloading = true
  window.location.reload()
}

/**
 * Is this page the build the server is serving? Asked every time the phone
 * gets a socket — a phone left open across a deploy would otherwise sit on the
 * old build until somebody thought to reload it — and again whenever a new
 * worker takes over.
 *
 * The answer from `/version` is the only thing that decides staleness. A new
 * worker on its own does not: it is often this very build claiming the page a
 * moment late, and reloading on that reloads twice for one deploy.
 */
async function checkForNewBuild(): Promise<void> {
  try {
    const response = await fetch('/version', { cache: 'no-store' })
    if (!response.ok) return
    if (!isDifferentBuild(__BUILD_VERSION__, await response.text())) return
    updatePending = true
    await (await workers?.getRegistration())?.update()
    reloadIfSafe()
  } catch {
    // Offline, or a dev server with no /version: try again on the next connect.
  }
}

// A remembered name is the whole of what it takes to get in: there is one
// world, this page is served by it, and the socket settles the rest. A phone
// that has played before therefore goes straight to waiting for the TV, which
// is what makes the installed app a single tap. Last, so every handler above
// is wired before it can fire.
if (evaluateJoinForm(nameInput.value).canJoin) submitJoin()
else askForName()
