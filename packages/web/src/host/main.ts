import {
  ServerToHostMessageSchema,
  generateRoomCode,
  normaliseName,
  type HostOutboundMessage,
  type ServerToHostMessage,
} from '@make-believe/shared'
import { connect } from '../lib/ws.js'
import {
  BLOB_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createBlobs,
  joinBlob,
  markAway,
  setInput,
  tick,
  type Blob,
  type Blobs,
} from './blobs.js'
import './host.css'

/**
 * The TV. It owns every scrap of game state: phones only ever send inputs.
 * The state itself lives in `blobs.ts`; this file is the socket, the canvas
 * and the frame loop. Phaser replaces the canvas in phase 3.
 */

const MAX_FRAME_MS = 50 // a backgrounded tab must not teleport everyone
const NAME_GAP = 14 // pixels between the top of a square and its label

const blobs: Blobs = createBlobs()

declare global {
  interface Window {
    /** Test seam: the e2e suite reads the world from here rather than pixels. */
    __game?: { blobs: Blobs; world: { width: number; height: number } }
  }
}
window.__game = { blobs, world: { width: WORLD_WIDTH, height: WORLD_HEIGHT } }

const canvas = document.querySelector<HTMLCanvasElement>('#world')
const context = canvas?.getContext('2d')
const roomCodeEl = document.querySelector<HTMLElement>('#room-code')
const joinUrlEl = document.querySelector<HTMLElement>('#join-url')
const statusEl = document.querySelector<HTMLElement>('#status')

if (!canvas || !context) throw new Error('the host page needs its canvas')

// The code identifies tonight's session of the one world this deployment runs.
const roomCode = generateRoomCode()
if (roomCodeEl) roomCodeEl.textContent = roomCode
if (joinUrlEl) joinUrlEl.textContent = window.location.origin

const client = connect({
  query: { role: 'host', room: roomCode },
  schema: ServerToHostMessageSchema,
  onMessage: applyMessage,
  onStatus: (status) => {
    if (!statusEl) return
    statusEl.textContent =
      status === 'open' ? '' : status === 'connecting' ? 'Connecting…' : 'Lost the server — retrying…'
  },
})

function send(message: HostOutboundMessage): void {
  client.send(message)
}

function applyMessage(message: ServerToHostMessage): void {
  switch (message.type) {
    case 'join': {
      // The schema has already refused a blank name; tidy it for the label.
      const blob = joinBlob(blobs, message.playerId, normaliseName(message.name))
      send({ type: 'assigned', colour: blob.colour, slot: blob.slot, to: blob.playerId })
      send({ type: 'phase', value: 'play', to: blob.playerId })
      break
    }
    case 'input': {
      setInput(blobs, message.playerId, message.dx, message.dy)
      break
    }
    case 'left': {
      // The square stays, faded, so a phone that refreshes walks back into it.
      markAway(blobs, message.playerId)
      break
    }
    case 'drawing':
    case 'text':
      // Phases 4 and 5.
      break
  }
}

function draw(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  for (const blob of blobs.values()) {
    ctx.globalAlpha = blob.away ? 0.3 : 1
    ctx.fillStyle = blob.colour
    ctx.fillRect(blob.x - BLOB_SIZE / 2, blob.y - BLOB_SIZE / 2, BLOB_SIZE, BLOB_SIZE)
    drawName(ctx, blob)
    ctx.globalAlpha = 1
  }
  if (blobs.size === 0) {
    ctx.fillStyle = 'rgba(244, 241, 234, 0.45)'
    ctx.font = '32px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('Waiting for players…', WORLD_WIDTH / 2, WORLD_HEIGHT / 2)
  }
}

/** The name sits centred just above the square, outlined so it reads on anything. */
function drawName(ctx: CanvasRenderingContext2D, blob: Blob): void {
  if (!blob.name) return
  const x = blob.x
  const y = blob.y - BLOB_SIZE / 2 - NAME_GAP
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(16, 18, 26, 0.85)'
  ctx.strokeText(blob.name, x, y)
  ctx.fillStyle = '#f4f1ea'
  ctx.fillText(blob.name, x, y)
}

let lastFrame = performance.now()
function frame(now: number): void {
  const dtMs = Math.min(now - lastFrame, MAX_FRAME_MS)
  lastFrame = now
  tick(blobs, dtMs)
  draw(context as CanvasRenderingContext2D)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
