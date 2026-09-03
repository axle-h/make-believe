import {
  HostInboundMessageSchema,
  type HostInboundMessage,
  type HostOutboundMessage,
  type Recipient,
} from '@make-believe/shared'
import { connect } from '../lib/ws.js'
import {
  applyMessage,
  briefFor,
  createGame,
  palette,
  snapshot,
  type Brief,
  type GameSnapshot,
  type GameState,
} from './game/index.js'
import { startDebugMenu } from './debug.js'
import { startPhaser, wornTextures } from './phaser/game.js'
import { joinUrl, qrSvg } from './qr.js'
import './host.css'

/**
 * The TV. It owns every scrap of game state: phones only ever send inputs.
 * The state itself lives in `game/`, Phaser draws it, and this file is the
 * socket and the wiring between the two.
 *
 * The TV takes no input of its own — no buttons, nothing to click. It is a
 * window onto the world and the phones run everything. The single exception is
 * a debug menu hidden behind the `d` key, which is for a grown-up looking at a
 * task out of order and is no part of playing.
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
      /** The world the relay gave us, or '' before it has said. Never shown. */
      session: () => string
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
 * Which world we are running. The relay mints it when this socket attaches and
 * says so straight away; the TV keeps it only for the test seam and for
 * anybody reading a log. It is never drawn and there is nowhere to type it.
 */
let session = ''

const url = joinUrl(window.location.origin)
if (qrEl) {
  // Parsed rather than assigned as HTML: the page never sets innerHTML.
  const svg = new DOMParser().parseFromString(qrSvg(url), 'image/svg+xml').documentElement
  qrEl.replaceChildren(svg)
  qrEl.setAttribute('aria-label', `Scan to open ${url}`)
}

const client = connect({
  query: { role: 'host' },
  schema: HostInboundMessageSchema,
  onMessage: handleMessage,
  onStatus: (status) => {
    if (!statusEl) return
    statusEl.textContent =
      status === 'open' ? '' : status === 'connecting' ? 'Connecting…' : 'Lost the server, retrying…'
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
 * What the world is asking for, out to the phones. A brief is words and
 * nothing else: it changes no screen, disables no tool and puts no phone into
 * a mode. Every phone can still drive, talk and draw while it is up.
 */
function sendBriefs(briefs: Brief[]): void {
  for (const brief of briefs) send({ ...brief, type: 'brief' })
}

/**
 * Every colour and who has it, which is the whole of what a join screen is
 * made of. It goes to one phone when its socket turns up, and to everybody
 * whenever the roster changes — so an open join screen greys itself out live,
 * and the eleventh phone watches a colour come free without anybody refreshing
 * anything.
 */
function sendPalette(to: Recipient): void {
  send({ type: 'palette', colours: palette(state), to })
}

/**
 * A phone said something. The model decides what it means; the only things the
 * TV has to answer are a socket arriving and a hello.
 *
 * The answer to a hello is which blob you are, and it doubles as the phone's
 * cue to put its controller up, so it goes out on a rejoin as well — a phone
 * that has just reloaded is waiting for it. It carries whether this blob
 * already has its drawing, because a world that has just been created has
 * forgotten every one of them and the phones are the only place they exist.
 *
 * A hello the world cannot grant is refused in as many words — the colour has
 * gone, the name is somebody else's, or there are already ten blobs — and the
 * fresh palette goes out **first**, so that the phone showing the refusal
 * already knows who has what.
 *
 * A blob that has walked in halfway through a task is told what is going on
 * right behind it, because the announcement it needed has already been made.
 */
function handleMessage(message: HostInboundMessage): void {
  // Which world this is, not something that happened in it: the model never
  // sees it.
  if (message.type === 'session') {
    session = message.session
    return
  }
  // A socket with nobody on it yet. Also not something that happened in the
  // world — there is no blob to hear about — so the model never sees it either.
  if (message.type === 'arrived') {
    sendPalette(message.playerId)
    return
  }
  const result = applyMessage(state, message)
  if (!result.applied) {
    if (!('refused' in result)) return
    sendPalette('*')
    send({ type: 'refused', reason: result.refused, to: result.playerId })
    return
  }
  if (result.kind === 'finished') {
    // A colour has come free, and somebody may be sitting on a join screen
    // waiting for exactly that.
    sendPalette('*')
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
  const brief = briefFor(state, player.playerId)
  if (brief) send({ ...brief, type: 'brief', to: player.playerId })
}

const phaser = startPhaser(world, state, {
  onBriefs: sendBriefs,
  // A blob the world has waited long enough for is gone, and its colour with
  // it. Anybody on a join screen should see that swatch go live.
  onForgotten: () => sendPalette('*'),
})

/**
 * The one thing on the TV that answers a key. It is hidden behind `d`, it is
 * for a grown-up with a keyboard, and it is not part of the game: see
 * `debug.ts` for why the "no input at all" rule makes an exception of it.
 */
startDebugMenu(document.body, state)
window.__game = {
  state,
  snapshot: () => snapshot(state),
  worn: () => wornTextures(phaser),
  session: () => session,
}
