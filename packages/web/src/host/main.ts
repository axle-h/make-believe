import {
  HostInboundMessageSchema,
  type HostInboundMessage,
  type HostOutboundMessage,
  type Recipient,
} from '@make-believe/shared'
import { connect } from '../lib/ws.js'
import { isDifferentBuild } from '../lib/version.js'
import {
  applyMessage,
  briefFor,
  createGame,
  grownup,
  grownupLadder,
  grownupTasks,
  obeyGrownup,
  palette,
  playerCount,
  snapshot,
  TEMPLATES,
  type Brief,
  type GameSnapshot,
  type Sound,
  type GameState,
} from './game/index.js'
import { startDebugMenu } from './debug.js'
import { shouldReload, VERSION_POLL_MS } from './updates.js'
import { startPhaser, wornTextures } from './phaser/game.js'
import { joinUrl, qrSvg } from './qr.js'
import './host.css'

/**
 * The TV owns all game state; phones only send inputs. It takes no input of its
 * own except the debug menu behind `d`.
 */

const state: GameState = createGame()

declare global {
  interface Window {
    /** Test seam: e2e reads the world here rather than from pixels. */
    __game?: {
      state: GameState
      snapshot: () => GameSnapshot
      worn: () => Record<string, string>
      session: () => string
      kinds: () => string[]
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

/** Kept only for the test seam; the session is never drawn. */
let session = ''

const url = joinUrl(window.location.origin)
if (qrEl) {
  // The page never sets innerHTML.
  const svg = new DOMParser().parseFromString(qrSvg(url), 'image/svg+xml').documentElement
  qrEl.replaceChildren(svg)
  qrEl.setAttribute('aria-label', `Scan to open ${url}`)
}

const client = connect({
  query: { role: 'host' },
  schema: HostInboundMessageSchema,
  onMessage: handleMessage,
  onStatus: (status) => {
    if (status === 'open') void checkForNewBuild()
    if (!statusEl) return
    statusEl.textContent =
      status === 'open' ? '' : status === 'connecting' ? 'Connecting…' : 'Lost the server, retrying…'
  },
  onFatal: ({ reason }) => {
    // Replaced by another TV: step aside rather than reconnect and fight for the world.
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

/** A brief is words only: it changes no screen, disables no tool and puts no phone into a mode. */
function sendBriefs(briefs: Brief[]): void {
  for (const brief of briefs) send({ ...brief, type: 'brief' })
  // A new task or level always comes with a changed brief.
  refreshGrownup()
}

function sendPalette(to: Recipient): void {
  send({ type: 'palette', colours: palette(state), to })
}

function handleMessage(message: HostInboundMessage): void {
  // `session`, `command` and `arrived` are not things the world hears; the model never sees them.
  if (message.type === 'session') {
    session = message.session
    return
  }
  if (message.type === 'command') {
    // The TV shows nothing: the command does exactly what the director does to itself.
    obeyGrownup(state, message)
    refreshGrownup()
    return
  }
  if (message.type === 'arrived') {
    sendPalette(message.playerId)
    return
  }
  const result = applyMessage(state, message)
  if (!result.applied) {
    if (!('refused' in result)) return
    // The palette goes first, so the refused phone already knows who has what.
    sendPalette('*')
    send({ type: 'refused', reason: result.refused, to: result.playerId })
    return
  }
  refreshGrownup()
  if (result.kind === 'finished') {
    sendPalette('*')
    reloadIfSafe()
    return
  }
  if (result.kind !== 'joined' && result.kind !== 'rejoined') return
  const { player } = result
  send({
    type: 'assigned',
    colour: player.colour,
    slot: player.slot,
    hasDrawing: player.skin !== null,
    to: player.playerId,
  })
  if (result.kind === 'joined') sendPalette('*')
  // A blob arriving mid-task missed the announcement.
  const brief = briefFor(state, player.playerId)
  if (brief) send({ ...brief, type: 'brief', to: player.playerId })
}

/**
 * The grown-up's sheet goes only to the blob the host decided was Daddy; a phone
 * that never receives it builds nothing, which is the whole of the secret.
 * Re-sent only when this signature of roster, ladder and tasks changes.
 */
let grownupSaid = ''

function refreshGrownup(): void {
  const daddy = grownup(state)
  if (!daddy) {
    grownupSaid = ''
    return
  }
  const tasks = grownupTasks(state)
  const ladder = grownupLadder(state)
  const saying = `${daddy.playerId} ${ladder.level} ${ladder.score} ${tasks
    .map((task) => `${task.kind}:${task.playable}`)
    .join(',')}`
  if (saying === grownupSaid) return
  grownupSaid = saying
  send({ type: 'grownup', tasks, ...ladder, to: daddy.playerId })
}

function sendSounds(sounds: Sound[]): void {
  for (const sound of sounds) send({ type: 'sound', cue: sound.cue, to: sound.to })
}

const phaser = startPhaser(world, state, {
  onBriefs: sendBriefs,
  onSounds: sendSounds,
  onForgotten: () => {
    sendPalette('*')
    refreshGrownup()
    reloadIfSafe()
  },
})

// --- keeping the TV on the build the server is serving ---------------------

let updatePending = false
let reloading = false

/** Only into an empty world, however long that takes: see `updates.ts`. */
function reloadIfSafe(): void {
  if (reloading || !shouldReload(playerCount(state), updatePending)) return
  reloading = true
  window.location.reload()
}

async function checkForNewBuild(): Promise<void> {
  try {
    const response = await fetch('/version', { cache: 'no-store' })
    if (!response.ok) return
    if (!isDifferentBuild(__BUILD_VERSION__, await response.text())) return
    updatePending = true
    reloadIfSafe()
  } catch {
    // Unreachable: the next poll asks again.
  }
}

// Checked on every socket open (above) and polled here for the hours afterwards.
setInterval(() => void checkForNewBuild(), VERSION_POLL_MS)

startDebugMenu(document.body, state)
window.__game = {
  state,
  snapshot: () => snapshot(state),
  worn: () => wornTextures(phaser),
  session: () => session,
  kinds: () => TEMPLATES.map((template) => template.kind),
}
