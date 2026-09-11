import {
  HostToPlayerMessageSchema,
  MAX_TEXT_LENGTH,
  isValidSessionCode,
  splitHeadline,
  type BriefMessage,
  type GrownupMessage,
  type HostToPlayerMessage,
  type PaletteEntry,
  type PlayerToHostMessage,
  type SoundCue,
} from '@make-believe/shared'
import { connect, type WsClient } from '../lib/ws.js'
import {
  CANVAS_SIZE,
  CRAYONS,
  FIRST_CRAYON,
  STROKE_WIDTH,
  cornerRadius,
  isSendablePng,
  pointerToCanvas,
} from './drawing.js'
import {
  choosableColours,
  evaluateJoinForm,
  joinFormError,
  nameTaken,
  refusalMessage,
  TAKEN_NAME,
  type Swatch,
} from './joinForm.js'
import { ZERO, createInputThrottle, vectorFromPointer, type Vector } from './joystick.js'
import { createSpeaker } from './audio.js'
import { isDifferentBuild } from '../lib/version.js'
import { shouldReload, type Screen } from './updates.js'
import './player.css'

// The phone is a dumb controller: it sends inputs, does what the TV says and holds no game state.
// Drive, say, draw and quit are live the whole time; the TV never switches a phone's mode.

const PLAYER_ID_KEY = 'make-believe.playerId'
const NAME_KEY = 'make-believe.name'
const COLOUR_KEY = 'make-believe.colour'
const SESSION_KEY = 'make-believe.session'
/** The phone holds the only copy of its drawing that survives a TV restart. */
const DRAWING_KEY = 'make-believe.drawing'
const SOUND_KEY = 'make-believe.sound'

const FIRST_WAIT_RETRY_MS = 800
const MAX_WAIT_RETRY_MS = 4_000
const SENT_MS = 1_500
const DEFAULT_BLOB = '#4ea8ff'

type Sheet = 'say' | 'draw' | 'menu' | 'quit' | 'options'

const screens: Record<Screen, HTMLElement> = {
  join: requireElement<HTMLElement>('#screen-join'),
  waiting: requireElement<HTMLElement>('#screen-waiting'),
  play: requireElement<HTMLElement>('#screen-play'),
}

/** A map because `options` is built at runtime, on one phone only. */
const sheets = new Map<Sheet, HTMLElement>([
  ['say', requireElement<HTMLElement>('#sheet-say')],
  ['draw', requireElement<HTMLElement>('#sheet-draw')],
  ['menu', requireElement<HTMLElement>('#sheet-menu')],
  ['quit', requireElement<HTMLElement>('#sheet-quit')],
])
const joinForm = requireElement<HTMLFormElement>('#join-form')
const joinColours = requireElement<HTMLElement>('#join-colours')
const joinFull = requireElement<HTMLElement>('#join-full')
const nameInput = requireElement<HTMLInputElement>('#name-input')
const joinButton = requireElement<HTMLButtonElement>('#join-button')
const joinError = requireElement<HTMLElement>('#join-error')
const waitingName = requireElement<HTMLElement>('#waiting-name')
const playName = requireElement<HTMLElement>('#play-name')
const brief = requireElement<HTMLElement>('#brief')
const briefHeadline = requireElement<HTMLElement>('#brief-headline')
const briefDetail = requireElement<HTMLElement>('#brief-detail')
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
const quitConfirm = requireElement<HTMLButtonElement>('#quit-confirm')
const linkStatus = requireElement<HTMLElement>('#link-status')

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`the player page needs ${selector}`)
  return element
}

/** Survives a refresh; minted again when the TV turns out to be running a different world. */
let playerId = loadPlayerId()
const throttle = createInputThrottle()

let client: WsClient | null = null
let joined: { name: string; colour: string } | null = null
/** As last sent by the TV. The phone only draws it; the world decides who has what. */
let palette: PaletteEntry[] = []
let chosen: string | null = loadStored(COLOUR_KEY)
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryMs = FIRST_WAIT_RETRY_MS
let screen: Screen = 'join'
let sheet: Sheet | null = null
let activePointer: number | null = null
let latest: Vector = ZERO

// --- getting in ----------------------------------------------------------

nameInput.value = loadStored(NAME_KEY) ?? ''

/** Only ever compared, never shown: '' if this phone has never been in a world. */
let lastSession = loadSession()

function loadSession(): string {
  const kept = loadStored(SESSION_KEY) ?? ''
  return isValidSessionCode(kept) ? kept : ''
}

nameInput.addEventListener('input', () => {
  joinError.textContent = nameTaken(palette, nameInput.value) ? TAKEN_NAME : ''
  refreshJoinButton()
})

joinForm.addEventListener('submit', (event) => {
  event.preventDefault()
  submitJoin()
})

function refreshJoinButton(): void {
  joinButton.disabled = !evaluateJoinForm(nameInput.value, chosen).canJoin
}

function renderColours(): void {
  const choice = choosableColours(palette, chosen)
  chosen = choice.chosen
  joinColours.replaceChildren(...choice.colours.map((swatch) => swatchButton(swatch)))
  joinFull.hidden = !choice.full
  refreshJoinButton()
}

function swatchButton(swatch: Swatch): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'swatch'
  button.style.setProperty('--swatch', swatch.hex)
  button.disabled = !swatch.free
  button.setAttribute('aria-pressed', String(swatch.hex === chosen))
  button.setAttribute('aria-label', swatch.takenBy ? `${swatch.name}: ${swatch.takenBy}` : swatch.name)
  button.dataset.colour = swatch.hex
  const who = document.createElement('span')
  who.className = 'swatch-who'
  who.textContent = swatch.takenBy ?? ''
  button.append(who)
  button.addEventListener('click', () => {
    chosen = swatch.hex
    store(COLOUR_KEY, swatch.hex)
    joinError.textContent = ''
    renderColours()
  })
  return button
}

function askForName(note = ''): void {
  joinError.textContent = note
  renderColours()
  showScreen('join')
}

function submitJoin(): void {
  const state = evaluateJoinForm(nameInput.value, chosen)
  if (!state.canJoin) {
    joinError.textContent = joinFormError(state)
    return
  }
  joinError.textContent = ''
  store(NAME_KEY, state.name)
  speaker.wake()
  joined = { name: state.name, colour: state.colour as string }
  waitingName.textContent = state.name
  // The socket is already open; the screen stays put until the TV grants or refuses.
  sayHello()
}

// --- the connection ------------------------------------------------------

/** Opened on load, before any name: the join screen is made of the palette only the TV has. */
function openSocket(): void {
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
      if (reason === 'no-host') {
        retryLater()
        return
      }
      stop()
      palette = []
      askForName('The TV would not let that in.')
    },
  })
}

/**
 * A different world means a fresh identity under the same name and drawing. The relay tags
 * what a phone says with the id its socket arrived under, so a new identity needs a new socket.
 */
function enterSession(code: string): void {
  const previous = lastSession
  lastSession = code
  store(SESSION_KEY, code)
  if (previous !== '' && previous !== code) {
    playerId = createPlayerId()
    store(PLAYER_ID_KEY, playerId)
    openSocket()
    return
  }
  // Only a phone already in *this* world walks straight back into its blob; any other asks
  // again, because its old colour may be somebody else's by now.
  const identity = joined ?? remembered()
  if (previous === code && identity) {
    joined = identity
    waitingName.textContent = identity.name
    sayHello()
    return
  }
  askForName()
}

function remembered(): { name: string; colour: string } | null {
  const name = loadStored(NAME_KEY) ?? ''
  const colour = loadStored(COLOUR_KEY) ?? ''
  if (!evaluateJoinForm(name, colour).canJoin) return null
  return { name, colour }
}

/** Said on every socket, not just the first; the world grants or refuses it. */
function sayHello(): void {
  if (!joined) return
  sendMessage({ type: 'join', playerId, name: joined.name, colour: joined.colour })
}

function applyMessage(message: HostToPlayerMessage): void {
  if (message.type === 'session') {
    enterSession(message.session)
    return
  }
  if (message.type === 'palette') {
    palette = message.colours
    if (screen === 'join') renderColours()
    return
  }
  // A refused phone goes back to the join screen, never to waiting.
  if (message.type === 'refused') {
    const wanted = joined?.colour ?? chosen
    joined = null
    askForName(refusalMessage(message.reason, palette, wanted))
    return
  }
  // A brief, like a sound, is information only: no screen changes and no tool goes away.
  if (message.type === 'brief') {
    showBrief(message)
    return
  }
  if (message.type === 'sound') {
    makeNoise(message.cue)
    return
  }
  // The host grants the grown-up's sheet to one phone; a phone never asks for it.
  if (message.type === 'grownup') {
    showOptions(message)
    return
  }
  if (message.type === 'assigned') {
    document.documentElement.style.setProperty('--blob', message.colour)
    blobColour = message.colour
    speaker.slot = message.slot
    playName.textContent = joined?.name ?? ''
    if (screen !== 'play') showScreen('play')
    if (!message.hasDrawing && lastDrawing) {
      sendMessage({ type: 'drawing', playerId, png: lastDrawing })
    }
    return
  }
  // `waiting`: the relay hangs up right behind it, and the close handler needs its reason.
  release()
  showBrief(null)
  showScreen('waiting')
}

/** An empty headline is how the TV clears it; `null` means there is no world to hear from. */
function showBrief(message: BriefMessage | null): void {
  const headline = message?.headline ?? ''
  const detail = message?.detail ?? ''
  paintHeadline(headline, message?.emphasis)
  briefDetail.textContent = detail
  briefDetail.hidden = detail.length === 0
  brief.dataset.tone = message?.tone ?? 'task'
  if (message?.colour) brief.style.setProperty('--brief', message.colour)
  else brief.style.removeProperty('--brief')
  brief.hidden = headline.length === 0
}

/** With an emphasised word, only that word keeps the colour and the rest goes to plain ink. */
function paintHeadline(headline: string, emphasis?: string): void {
  const { before, word, after } = splitHeadline(headline, emphasis)
  briefHeadline.replaceChildren(before)
  briefHeadline.classList.toggle('painted', word.length > 0)
  if (word.length === 0) return
  const painted = document.createElement('span')
  painted.className = 'brief-word'
  painted.textContent = word
  briefHeadline.append(painted, after)
}

/**
 * Every phone keeps knocking, including one that has never joined: `attachHost` announces a new
 * world only to phones holding a socket, so one that stopped would never be spoken to again.
 */
function retryLater(): void {
  client?.close()
  client = null
  release()
  showScreen('waiting')
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = setTimeout(openSocket, retryMs)
  retryMs = Math.min(retryMs * 2, MAX_WAIT_RETRY_MS)
}

// --- the noises ----------------------------------------------------------

const speaker = createSpeaker(() => new AudioContext(), loadStored(SOUND_KEY) === 'off')

// Most phones never see the join screen, so the Join tap cannot be relied on to wake audio.
// The first touch anywhere on the page is the wake that matters.
document.addEventListener('pointerdown', () => speaker.wake(), { once: true })

const soundButton = requireElement<HTMLButtonElement>('#menu-sound')
soundButton.addEventListener('click', () => {
  speaker.muted = !speaker.muted
  store(SOUND_KEY, speaker.muted ? 'off' : 'on')
  showSoundSwitch()
  speaker.wake()
})

function showSoundSwitch(): void {
  soundButton.textContent = speaker.muted ? 'Sound: off' : 'Sound: on'
  soundButton.setAttribute('aria-pressed', String(!speaker.muted))
}

function makeNoise(cue: SoundCue): void {
  speaker.play(cue)
}

// --- keeping the screen on -----------------------------------------------

let wakeLock: WakeLockSentinel | null = null

/** Wake Lock needs a secure context, so on plain http this quietly does nothing. */
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
    .catch(() => {})
}

function letSleep(): void {
  void wakeLock?.release()
  wakeLock = null
}

// A lock is dropped whenever the phone is backgrounded; take it again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && joined) keepAwake()
})

function stop(): void {
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  retryMs = FIRST_WAIT_RETRY_MS
  client?.close()
  client = null
  joined = null
  linkStatus.hidden = true
  letSleep()
}

function sendMessage(message: PlayerToHostMessage): void {
  client?.send(message)
}

function showScreen(which: Screen): void {
  screen = which
  for (const [name, element] of Object.entries(screens)) element.hidden = name !== which
  if (which !== 'play') closeSheet()
  reloadIfSafe()
}

// --- the tools over the joystick -----------------------------------------

for (const [name, button] of [
  ['say', requireElement<HTMLButtonElement>('#tool-say')],
  ['draw', requireElement<HTMLButtonElement>('#tool-draw')],
  ['menu', requireElement<HTMLButtonElement>('#tool-menu')],
] as const) {
  button.addEventListener('click', () => openSheet(name))
}

for (const selector of ['#say-close', '#draw-close', '#menu-close', '#quit-close', '#quit-cancel']) {
  requireElement<HTMLButtonElement>(selector).addEventListener('click', closeSheet)
}

requireElement<HTMLButtonElement>('#menu-quit').addEventListener('click', () => openSheet('quit'))

/** The blob stops first, or a thumb leaving the pad would leave it running. */
function openSheet(which: Sheet): void {
  release()
  sheet = which
  for (const [name, element] of sheets) element.hidden = name !== which
  if (which === 'say') openKeyboard()
  if (which === 'draw') openSketch()
}

function closeSheet(): void {
  sheet = null
  for (const element of sheets.values()) element.hidden = true
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

/** Android's keyboard shrinks the viewport rather than scrolling, so the box is kept in view. */
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

// --- the sheet only one phone in the room has ----------------------------

/**
 * The grown-up's sheet is a secret from the children: it is built only here, at runtime, when the
 * TV sends one, and is never in the markup nor shown greyed on a phone without it.
 */
let optionsSheet: HTMLElement | null = null
let optionsLadder: HTMLElement | null = null
let optionsTasks: HTMLElement | null = null

function showOptions(message: GrownupMessage): void {
  const { tasks, list } = optionsSheet ? existingOptions() : buildOptions()
  tasks.textContent = `Level ${message.level} of ${message.maxLevel} · ${message.score} points`
  list.replaceChildren(
    ...message.tasks.map((task) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'button button-quiet'
      button.dataset.task = task.kind
      button.textContent = task.title
      button.disabled = !task.playable
      button.addEventListener('click', () => {
        sendMessage({ type: 'command', playerId, command: 'task', kind: task.kind })
        closeSheet()
      })
      return button
    }),
  )
}

function existingOptions(): { tasks: HTMLElement; list: HTMLElement } {
  return { tasks: optionsLadder as HTMLElement, list: optionsTasks as HTMLElement }
}

function buildOptions(): { tasks: HTMLElement; list: HTMLElement } {
  const sheetEl = document.createElement('div')
  sheetEl.id = 'sheet-options'
  sheetEl.className = 'sheet'
  sheetEl.hidden = true

  const head = document.createElement('header')
  head.className = 'sheet-head'
  const heading = document.createElement('h2')
  heading.textContent = 'Options'
  const close = document.createElement('button')
  close.className = 'close'
  close.type = 'button'
  close.textContent = '✕'
  close.setAttribute('aria-label', 'Back to the joystick')
  close.addEventListener('click', closeSheet)
  head.append(heading, close)

  const ladder = document.createElement('p')
  ladder.className = 'hint sheet-hint'
  const list = document.createElement('div')
  list.className = 'menu-items'
  sheetEl.append(head, ladder, list, buildRestart())
  document.body.append(sheetEl)

  sheets.set('options', sheetEl)
  optionsSheet = sheetEl
  optionsLadder = ladder
  optionsTasks = list

  const item = document.createElement('button')
  item.id = 'menu-options'
  item.type = 'button'
  item.className = 'button button-quiet'
  item.textContent = 'Options'
  item.addEventListener('click', () => openSheet('options'))
  requireElement<HTMLElement>('#sheet-menu .menu-items').append(item)

  return { tasks: ladder, list }
}

/** Asks first, as Quit does, because it throws something away. */
function buildRestart(): HTMLElement {
  const row = document.createElement('div')
  row.className = 'sheet-buttons'
  const ask = document.createElement('button')
  ask.id = 'options-restart'
  ask.type = 'button'
  ask.className = 'button button-quiet'
  ask.textContent = 'Start from the beginning'

  const confirm = document.createElement('button')
  confirm.id = 'options-restart-confirm'
  confirm.type = 'button'
  confirm.className = 'button'
  confirm.textContent = 'Yes, start again'
  confirm.hidden = true

  ask.addEventListener('click', () => {
    ask.hidden = true
    confirm.hidden = false
  })
  confirm.addEventListener('click', () => {
    sendMessage({ type: 'command', playerId, command: 'restart' })
    confirm.hidden = true
    ask.hidden = false
    closeSheet()
  })
  row.append(ask, confirm)
  return row
}

// --- quitting ------------------------------------------------------------

// Quit is `finish` on the wire. Nothing is waited for: the phone forgets its blob either way.
quitConfirm.addEventListener('click', () => {
  release()
  sendMessage({ type: 'finish', playerId })
  closeSheet()
  stop()
  startOver()
  showScreen('waiting')
  openSocket()
})

function startOver(): void {
  playerId = createPlayerId()
  store(PLAYER_ID_KEY, playerId)
  forget(NAME_KEY)
  forget(DRAWING_KEY)
  forget(COLOUR_KEY)
  chosen = null
  lastDrawing = null
  nameInput.value = ''
  showBrief(null)
  blobColour = DEFAULT_BLOB
  document.documentElement.style.setProperty('--blob', DEFAULT_BLOB)
  sketch?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  sketchStarted = false
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
  // randomUUID needs a secure context.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function loadStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

function forget(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

// --- drawing a blob ------------------------------------------------------

let blobColour = DEFAULT_BLOB
let lastDrawing = loadStored(DRAWING_KEY)
let crayon: string = FIRST_CRAYON
let drawPointer: number | null = null
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
  } catch {}
  const at = pointAt(event)
  sketch.strokeStyle = crayon
  sketch.beginPath()
  sketch.moveTo(at.x, at.y)
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

/** An oversize PNG is shrunk rather than silently dropped. */
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
  closeSheet()
}

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
  } catch {}
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

function send(vector: Vector): void {
  if (!throttle.shouldSend(performance.now(), vector)) return
  sendMessage({ type: 'input', playerId, dx: vector.dx, dy: vector.dy })
}

/** The throttle can refuse a flick's last move, so a held pad keeps resending the thumb. */
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

const workers = 'serviceWorker' in navigator ? navigator.serviceWorker : null
const hadController = Boolean(workers?.controller)
let updatePending = false
let reloading = false

workers
  ?.register(`/sw.js?v=${__BUILD_VERSION__}`, { updateViaCache: 'none' })
  .catch(() => {})

workers?.addEventListener('controllerchange', () => {
  if (!hadController) return
  // A new worker may be this very build claiming the page late, so it only prompts a look.
  void checkForNewBuild()
})

/** A phone reloads for a new build only on the waiting screen (`updates.ts`). */
function reloadIfSafe(): void {
  if (reloading || !shouldReload(screen, updatePending)) return
  reloading = true
  window.location.reload()
}

/** `/version` is the only thing that decides staleness, asked on every socket. */
async function checkForNewBuild(): Promise<void> {
  try {
    const response = await fetch('/version', { cache: 'no-store' })
    if (!response.ok) return
    if (!isDifferentBuild(__BUILD_VERSION__, await response.text())) return
    updatePending = true
    await (await workers?.getRegistration())?.update()
    reloadIfSafe()
  } catch {}
}

// Last, so every handler above is wired before it can fire.
showSoundSwitch()
showScreen('waiting')
waitingName.textContent = loadStored(NAME_KEY) ?? 'Your blob'
openSocket()
