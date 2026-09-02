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
const ROOM_KEY = 'make-believe.room'
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

/**
 * How often a phone that is waiting knocks on the TV's door. A TV that has
 * just reloaded keeps the phones' sockets (the relay does not drop them when
 * the code is unchanged) but knows nothing about them, so the phone has to say
 * hello again of its own accord.
 */
const KNOCK_MS = 2_000

/** How long "Sent" stays under the box before it clears itself. */
const SENT_MS = 1_500

/** What is open over the joystick, if anything. */
type Sheet = 'say' | 'draw' | 'name'

const screens: Record<Screen, HTMLElement> = {
  scan: requireElement<HTMLElement>('#screen-scan'),
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
const scanNote = requireElement<HTMLElement>('#scan-note')
const waitingCode = requireElement<HTMLElement>('#waiting-code')
const waitingName = requireElement<HTMLElement>('#waiting-name')
const changeCodeButton = requireElement<HTMLButtonElement>('#change-code-button')
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

const playerId = loadPlayerId()
const throttle = createInputThrottle()

let client: WsClient | null = null
/** What we joined with, so a retry can use the same thing. */
let session: { room: string; name: string } | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryMs = FIRST_WAIT_RETRY_MS
let screen: Screen = 'scan'
/** What is open over the joystick, or `null` for the joystick itself. */
let sheet: Sheet | null = null
/** The pointer holding the pad down, if any. */
let activePointer: number | null = null
/** Where the thumb is right now; the send loop drains it. */
let latest: Vector = ZERO

// --- getting in ----------------------------------------------------------

nameInput.value = loadStored(NAME_KEY) ?? ''

/**
 * Tonight's code, or '' when we have not got one. There is nowhere to type it:
 * the TV shows only a QR code, with the code inside it, so the code arrives in
 * the link a scan opens or not at all.
 */
let roomCode = ''

/** The code a scan has just brought in, or the one from last time on a refresh. */
function initialRoomCode(): string {
  const fromUrl = normaliseRoomCode(new URLSearchParams(window.location.search).get('room') ?? '')
  if (isValidRoomCode(fromUrl)) return fromUrl
  const fromStorage = normaliseRoomCode(loadStored(ROOM_KEY) ?? '')
  return isValidRoomCode(fromStorage) ? fromStorage : ''
}

nameInput.addEventListener('input', () => {
  joinError.textContent = ''
  refreshJoinButton()
})

joinForm.addEventListener('submit', (event) => {
  event.preventDefault()
  submitJoin()
})

changeCodeButton.addEventListener('click', () => {
  stop()
  askForScan()
})

function refreshJoinButton(): void {
  joinButton.disabled = !evaluateJoinForm(roomCode, nameInput.value).canJoin
}

/** Ask who is holding the phone; the code is already in hand. */
function askForName(): void {
  joinError.textContent = ''
  refreshJoinButton()
  showScreen('join')
  nameInput.focus()
}

/**
 * Send them back to the TV. The code we had (if any) is dropped along with it,
 * so a stale one cannot quietly come back on the next refresh.
 */
function askForScan(note = ''): void {
  roomCode = ''
  forget(ROOM_KEY)
  scanNote.textContent = note
  showScreen('scan')
}

function submitJoin(): void {
  const state = evaluateJoinForm(roomCode, nameInput.value)
  if (!state.roomValid) {
    askForScan('That link had no code in it.')
    return
  }
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
  const { room } = session
  client?.close()
  client = connect({
    query: { role: 'player', room, playerId },
    schema: HostToPlayerMessageSchema,
    onMessage: applyMessage,
    onStatus: (status) => {
      linkStatus.hidden = status === 'open'
      if (status !== 'open') return
      retryMs = FIRST_WAIT_RETRY_MS
      sayHello()
      keepAwake()
      void checkForNewBuild()
    },
    onFatal: ({ reason }) => {
      // The relay hung up for good. A TV that is not there yet is worth
      // waiting for; anything else means this code will never work.
      if (reason === 'no-host') {
        retryLater()
        return
      }
      stop()
      askForScan(
        reason === 'wrong-room' ? 'The TV has a new code now.' : 'The TV would not let that in.',
      )
    },
  })
}

/**
 * Tell the TV who this phone is. The name is read at the moment of sending
 * rather than when the socket was opened: the client reconnects on its own
 * after a blip, and a blob renamed in between would otherwise be introduced
 * under its old name and quietly renamed back.
 */
function sayHello(): void {
  if (!session) return
  sendMessage({ type: 'join', playerId, name: session.name })
}

/**
 * The TV has two things it can say. `assigned` means "you are the blue one",
 * and it doubles as the way in: it only ever arrives in answer to a hello, so
 * it is proof the TV knows this phone and the controller can go up.
 */
function applyMessage(message: HostToPlayerMessage): void {
  if (message.type === 'assigned') {
    document.documentElement.style.setProperty('--blob', message.colour)
    blobColour = message.colour
    playName.textContent = session?.name ?? ''
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
  if (screen !== 'waiting') return
  sayHello()
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
  // Nothing but the joystick has a sheet over it, so leaving the controller
  // takes any sheet with it.
  if (which !== 'play') closeSheet()
  refreshInstall()
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
  const state = evaluateJoinForm(roomCode, renameInput.value)
  if (!state.nameValid || !session) return
  session = { ...session, name: state.name }
  store(NAME_KEY, state.name)
  sayHello()
  nameInput.value = state.name
  playName.textContent = state.name
  renameStatus.textContent = 'Sent to the TV'
  closeSheet()
})

renameInput.addEventListener('input', () => {
  renameSave.disabled = !evaluateJoinForm(roomCode, renameInput.value).nameValid
})

function openRename(): void {
  renameStatus.textContent = ''
  renameInput.value = session?.name ?? ''
  renameSave.disabled = !evaluateJoinForm(roomCode, renameInput.value).nameValid
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

function forget(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // As above.
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
 * The phone can install the player page from Chrome's own prompt, and from
 * then on it opens fullscreen from an icon. That makes keeping it up to date
 * our problem rather than the browser's: nobody is going to reload an app.
 */

const installButton = requireElement<HTMLButtonElement>('#install-button')

/** The service worker registry, or null on a browser or origin without one. */
const workers = 'serviceWorker' in navigator ? navigator.serviceWorker : null

/** Whether a worker was already driving this page when it loaded. */
const hadController = Boolean(workers?.controller)

/** Set when a newer build is ready but the phone is busy with something. */
let updatePending = false

/** Set once a reload is on its way; asking twice only races the first. */
let reloading = false

/** Chrome's install prompt, held back until there is somewhere to put it. */
let installPrompt: BeforeInstallPromptEvent | null = null

workers
  ?.register(`/sw.js?v=${__BUILD_VERSION__}`, { updateViaCache: 'none' })
  .catch(() => {
    // No secure context, most likely: plain http on the LAN. The page works
    // exactly as before, it just is not installable.
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

window.addEventListener('beforeinstallprompt', (event) => {
  // Chrome's own banner is held off so the offer can sit on the scan screen,
  // which is the one moment the phone has nothing else to say.
  event.preventDefault()
  installPrompt = event
  refreshInstall()
})

window.addEventListener('appinstalled', () => {
  installPrompt = null
  refreshInstall()
})

installButton.addEventListener('click', () => {
  const prompt = installPrompt
  // One prompt per event: it cannot be shown twice, so the button goes now.
  installPrompt = null
  refreshInstall()
  void prompt?.prompt()
})

/** True once the page is running from its icon rather than in a browser tab. */
function isInstalled(): boolean {
  return ['fullscreen', 'standalone', 'minimal-ui'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  )
}

function refreshInstall(): void {
  installButton.hidden = installPrompt === null || screen !== 'scan' || isInstalled()
}

// A remembered name and a code, from the QR link or from last time, means there
// is nothing to ask. Last, so every handler above is wired before it can fire.
roomCode = initialRoomCode()
if (!isValidRoomCode(roomCode)) askForScan()
else if (evaluateJoinForm(roomCode, nameInput.value).canJoin) submitJoin()
else askForName()
