import {
  ServerToHostMessageSchema,
  generateRoomCode,
  type HostOutboundMessage,
  type ServerToHostMessage,
} from '@make-believe/shared'
import { connect } from '../lib/ws.js'
import './host.css'

/**
 * The TV. It owns every scrap of game state: phones only ever send inputs.
 * Phase 1 draws coloured squares on a plain canvas; Phaser arrives in phase 3.
 */

const WORLD_WIDTH = 1280
const WORLD_HEIGHT = 720
const BLOB_SIZE = 72
const SPEED = 420 // pixels per second at full deflection
const MAX_FRAME_MS = 50 // a backgrounded tab must not teleport everyone

/** One colour per slot, in slot order. */
const PALETTE = [
  '#ff5d5d',
  '#4ea8ff',
  '#5ddf7f',
  '#ffd23f',
  '#c07bff',
  '#ff8f3f',
  '#3fe0d0',
  '#ff6fc1',
] as const

interface Blob {
  playerId: string
  slot: number
  colour: string
  x: number
  y: number
  dx: number
  dy: number
}

const blobs = new Map<string, Blob>()

declare global {
  interface Window {
    /** Test seam: the e2e suite reads the world from here rather than pixels. */
    __game?: { blobs: Map<string, Blob>; world: { width: number; height: number } }
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
      const blob = blobs.get(message.playerId) ?? spawn(message.playerId)
      blobs.set(blob.playerId, blob)
      send({ type: 'assigned', colour: blob.colour, slot: blob.slot, to: blob.playerId })
      send({ type: 'phase', value: 'play', to: blob.playerId })
      break
    }
    case 'input': {
      const blob = blobs.get(message.playerId)
      if (!blob) break
      blob.dx = message.dx
      blob.dy = message.dy
      break
    }
    case 'left': {
      blobs.delete(message.playerId)
      break
    }
    case 'drawing':
    case 'text':
      // Phases 4 and 5.
      break
  }
}

/** The lowest slot nobody is using, so a leaver's colour is reused. */
function nextFreeSlot(): number {
  const taken = new Set([...blobs.values()].map((blob) => blob.slot))
  let slot = 0
  while (taken.has(slot)) slot++
  return slot
}

function spawn(playerId: string): Blob {
  const slot = nextFreeSlot()
  const columns = 4
  const x = ((slot % columns) + 1) * (WORLD_WIDTH / (columns + 1))
  const y = Math.floor(slot / columns) === 0 ? WORLD_HEIGHT / 3 : (WORLD_HEIGHT * 2) / 3
  return {
    playerId,
    slot,
    colour: PALETTE[slot % PALETTE.length] as string,
    x,
    y,
    dx: 0,
    dy: 0,
  }
}

function tick(dtMs: number): void {
  const dt = dtMs / 1000
  const half = BLOB_SIZE / 2
  for (const blob of blobs.values()) {
    blob.x = clamp(blob.x + blob.dx * SPEED * dt, half, WORLD_WIDTH - half)
    blob.y = clamp(blob.y + blob.dy * SPEED * dt, half, WORLD_HEIGHT - half)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function draw(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  for (const blob of blobs.values()) {
    ctx.fillStyle = blob.colour
    ctx.fillRect(blob.x - BLOB_SIZE / 2, blob.y - BLOB_SIZE / 2, BLOB_SIZE, BLOB_SIZE)
  }
  if (blobs.size === 0) {
    ctx.fillStyle = 'rgba(244, 241, 234, 0.45)'
    ctx.font = '32px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Waiting for players…', WORLD_WIDTH / 2, WORLD_HEIGHT / 2)
  }
}

let lastFrame = performance.now()
function frame(now: number): void {
  const dtMs = Math.min(now - lastFrame, MAX_FRAME_MS)
  lastFrame = now
  tick(dtMs)
  draw(context as CanvasRenderingContext2D)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
