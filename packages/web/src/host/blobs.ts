/**
 * The blobs the TV is showing, as pure functions over a plain `Map`. No DOM,
 * no canvas: `main.ts` draws whatever this says. Phase 3 grows this into the
 * full game model under `game/`; keeping it out of `main.ts` now is what makes
 * the rejoin rule testable.
 */

export const WORLD_WIDTH = 1280
export const WORLD_HEIGHT = 720
export const BLOB_SIZE = 72
/** Pixels per second at full deflection. */
export const SPEED = 420
/**
 * How long a blob waits on screen for a phone that has gone. Long enough to
 * cover a refresh or a walk out of wifi range; short enough that a child who
 * puts the phone down does not clutter the TV all evening.
 */
export const AWAY_TIMEOUT_MS = 30_000

/** One colour per slot, in slot order. */
export const PALETTE = [
  '#ff5d5d',
  '#4ea8ff',
  '#5ddf7f',
  '#ffd23f',
  '#c07bff',
  '#ff8f3f',
  '#3fe0d0',
  '#ff6fc1',
] as const

export interface Blob {
  playerId: string
  /** What the phone called itself; drawn above the square. */
  name: string
  slot: number
  colour: string
  x: number
  y: number
  dx: number
  dy: number
  /** True while the phone is gone. The square stays, faded, waiting. */
  away: boolean
  /** How long it has been away, in milliseconds of ticks. */
  awayForMs: number
}

export type Blobs = Map<string, Blob>

export function createBlobs(): Blobs {
  return new Map()
}

/** The lowest slot nobody is using, so a leaver's colour is reused. */
export function nextFreeSlot(blobs: Blobs): number {
  const taken = new Set([...blobs.values()].map((blob) => blob.slot))
  let slot = 0
  while (taken.has(slot)) slot++
  return slot
}

/** Where a blob starts life: spread across two rows, well inside the walls. */
export function spawnPosition(slot: number): { x: number; y: number } {
  const columns = 4
  const x = ((slot % columns) + 1) * (WORLD_WIDTH / (columns + 1))
  const y = Math.floor(slot / columns) % 2 === 0 ? WORLD_HEIGHT / 3 : (WORLD_HEIGHT * 2) / 3
  return { x, y }
}

/**
 * A phone said hello. A `playerId` we already know keeps its square, colour and
 * position — this is what makes a refresh on the phone a non-event — and only
 * takes the new name. Anyone else gets a fresh blob.
 */
export function joinBlob(blobs: Blobs, playerId: string, name: string): Blob {
  const existing = blobs.get(playerId)
  if (existing) {
    existing.name = name
    existing.away = false
    existing.awayForMs = 0
    return existing
  }
  const slot = nextFreeSlot(blobs)
  const { x, y } = spawnPosition(slot)
  const blob: Blob = {
    playerId,
    name,
    slot,
    colour: PALETTE[slot % PALETTE.length] as string,
    x,
    y,
    dx: 0,
    dy: 0,
    away: false,
    awayForMs: 0,
  }
  blobs.set(playerId, blob)
  return blob
}

/** Steer a blob we know about. Input from a stranger is ignored. */
export function setInput(blobs: Blobs, playerId: string, dx: number, dy: number): void {
  const blob = blobs.get(playerId)
  if (!blob) return
  blob.dx = dx
  blob.dy = dy
}

/**
 * The phone went away. The blob stays put, holding its slot, colour, name and
 * position, so that a refresh — or a rejoin from the same phone — walks back
 * into the same square. `tick` clears it out if nobody comes back.
 */
export function markAway(blobs: Blobs, playerId: string): void {
  const blob = blobs.get(playerId)
  if (!blob) return
  blob.away = true
  blob.awayForMs = 0
  blob.dx = 0
  blob.dy = 0
}

export function removeBlob(blobs: Blobs, playerId: string): void {
  blobs.delete(playerId)
}

/** Move everyone by their velocity, and forget anyone who is not coming back. */
export function tick(blobs: Blobs, dtMs: number): void {
  const dt = dtMs / 1000
  const half = BLOB_SIZE / 2
  for (const blob of blobs.values()) {
    if (blob.away) {
      blob.awayForMs += dtMs
      if (blob.awayForMs >= AWAY_TIMEOUT_MS) blobs.delete(blob.playerId)
      continue
    }
    blob.x = clamp(blob.x + blob.dx * SPEED * dt, half, WORLD_WIDTH - half)
    blob.y = clamp(blob.y + blob.dy * SPEED * dt, half, WORLD_HEIGHT - half)
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
