import { describe, expect, it } from 'vitest'
import {
  AWAY_TIMEOUT_MS,
  BLOB_SIZE,
  PALETTE,
  SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createBlobs,
  joinBlob,
  markAway,
  nextFreeSlot,
  removeBlob,
  setInput,
  tick,
} from './blobs.js'

describe('joinBlob', () => {
  it('spawns inside the world with slot 0 and the first colour', () => {
    const blobs = createBlobs()
    const blob = joinBlob(blobs, 'p1', 'Wilf')

    expect(blob).toMatchObject({ playerId: 'p1', name: 'Wilf', slot: 0, colour: PALETTE[0] })
    expect(blob.x).toBeGreaterThan(BLOB_SIZE / 2)
    expect(blob.x).toBeLessThan(WORLD_WIDTH - BLOB_SIZE / 2)
    expect(blob.y).toBeGreaterThan(BLOB_SIZE / 2)
    expect(blob.y).toBeLessThan(WORLD_HEIGHT - BLOB_SIZE / 2)
    expect(blobs.size).toBe(1)
  })

  it('gives each new player their own slot, colour and spot', () => {
    const blobs = createBlobs()
    const first = joinBlob(blobs, 'p1', 'Wilf')
    const second = joinBlob(blobs, 'p2', 'Ida')

    expect(second.slot).toBe(1)
    expect(second.colour).not.toBe(first.colour)
    expect({ x: second.x, y: second.y }).not.toEqual({ x: first.x, y: first.y })
    expect(blobs.size).toBe(2)
  })

  it('reattaches the same playerId to the same square, keeping where it was', () => {
    const blobs = createBlobs()
    const before = joinBlob(blobs, 'p1', 'Wilf')
    joinBlob(blobs, 'p2', 'Ida')
    setInput(blobs, 'p1', 1, 0)
    tick(blobs, 500)
    const moved = { x: before.x, y: before.y }

    // The phone refreshed: same playerId, same name typed again.
    const after = joinBlob(blobs, 'p1', 'Wilf')

    expect(blobs.size).toBe(2)
    expect(after.slot).toBe(before.slot)
    expect(after.colour).toBe(before.colour)
    expect({ x: after.x, y: after.y }).toEqual(moved)
  })

  it('takes a new name on a rejoin', () => {
    const blobs = createBlobs()
    joinBlob(blobs, 'p1', 'Wilf')
    expect(joinBlob(blobs, 'p1', 'Big Ted').name).toBe('Big Ted')
    expect(blobs.size).toBe(1)
  })
})

describe('a phone that goes away', () => {
  it('keeps the square, faded, holding its slot and its spot', () => {
    const blobs = createBlobs()
    const blob = joinBlob(blobs, 'p1', 'Wilf')
    setInput(blobs, 'p1', 1, 0)
    tick(blobs, 500)
    const spot = { x: blob.x, y: blob.y }

    markAway(blobs, 'p1')

    expect(blobs.size).toBe(1)
    expect(blob.away).toBe(true)
    expect({ x: blob.x, y: blob.y }).toEqual(spot)
    expect(nextFreeSlot(blobs)).toBe(1)
  })

  it('stops dead rather than drifting on its last input', () => {
    const blobs = createBlobs()
    const blob = joinBlob(blobs, 'p1', 'Wilf')
    setInput(blobs, 'p1', 1, 1)
    markAway(blobs, 'p1')
    const spot = { x: blob.x, y: blob.y }
    tick(blobs, 1000)

    expect({ x: blob.x, y: blob.y }).toEqual(spot)
  })

  it('walks back into the same square when the phone refreshes', () => {
    const blobs = createBlobs()
    const before = joinBlob(blobs, 'p1', 'Wilf')
    setInput(blobs, 'p1', 1, 0)
    tick(blobs, 500)
    const spot = { x: before.x, y: before.y }
    markAway(blobs, 'p1')
    tick(blobs, AWAY_TIMEOUT_MS - 1)

    const after = joinBlob(blobs, 'p1', 'Wilf')

    expect(after.away).toBe(false)
    expect(after.slot).toBe(before.slot)
    expect(after.colour).toBe(before.colour)
    expect(after.name).toBe('Wilf')
    expect({ x: after.x, y: after.y }).toEqual(spot)
    expect(blobs.size).toBe(1)
  })

  it('is forgotten, and frees its slot, once nobody comes back', () => {
    const blobs = createBlobs()
    joinBlob(blobs, 'p1', 'Wilf')
    joinBlob(blobs, 'p2', 'Ida')
    markAway(blobs, 'p1')
    tick(blobs, AWAY_TIMEOUT_MS)

    expect(blobs.has('p1')).toBe(false)
    expect(blobs.size).toBe(1)
    expect(nextFreeSlot(blobs)).toBe(0)
  })

  it('never forgets a phone that is still there', () => {
    const blobs = createBlobs()
    joinBlob(blobs, 'p1', 'Wilf')
    tick(blobs, AWAY_TIMEOUT_MS * 3)

    expect(blobs.has('p1')).toBe(true)
  })

  it('gives a returning phone the full wait again', () => {
    const blobs = createBlobs()
    joinBlob(blobs, 'p1', 'Wilf')
    markAway(blobs, 'p1')
    tick(blobs, AWAY_TIMEOUT_MS - 1)
    joinBlob(blobs, 'p1', 'Wilf')
    markAway(blobs, 'p1')
    tick(blobs, AWAY_TIMEOUT_MS - 1)

    expect(blobs.has('p1')).toBe(true)
  })

  it('ignores a phone it has never heard of', () => {
    const blobs = createBlobs()
    markAway(blobs, 'ghost')
    expect(blobs.size).toBe(0)
  })
})

describe('nextFreeSlot', () => {
  it('reuses the slot a leaver gave up', () => {
    const blobs = createBlobs()
    joinBlob(blobs, 'p1', 'Wilf')
    joinBlob(blobs, 'p2', 'Ida')
    removeBlob(blobs, 'p1')

    expect(nextFreeSlot(blobs)).toBe(0)
    expect(joinBlob(blobs, 'p3', 'Ted').colour).toBe(PALETTE[0])
  })
})

describe('setInput and removeBlob', () => {
  it('ignores input from a player who has not joined', () => {
    const blobs = createBlobs()
    setInput(blobs, 'ghost', 1, 1)
    expect(blobs.size).toBe(0)
  })

  it('forgets a player who left', () => {
    const blobs = createBlobs()
    joinBlob(blobs, 'p1', 'Wilf')
    removeBlob(blobs, 'p1')
    expect(blobs.size).toBe(0)
  })
})

describe('tick', () => {
  it('moves a blob by velocity times time', () => {
    const blobs = createBlobs()
    const blob = joinBlob(blobs, 'p1', 'Wilf')
    const startX = blob.x
    setInput(blobs, 'p1', 0.5, 0)
    tick(blobs, 1000)

    expect(blob.x).toBeCloseTo(startX + SPEED * 0.5, 5)
    expect(blob.dy).toBe(0)
  })

  it('keeps a blob inside the world however hard it runs', () => {
    const blobs = createBlobs()
    const blob = joinBlob(blobs, 'p1', 'Wilf')
    setInput(blobs, 'p1', -1, -1)
    tick(blobs, 10_000)

    expect(blob.x).toBe(BLOB_SIZE / 2)
    expect(blob.y).toBe(BLOB_SIZE / 2)

    setInput(blobs, 'p1', 1, 1)
    tick(blobs, 10_000)

    expect(blob.x).toBe(WORLD_WIDTH - BLOB_SIZE / 2)
    expect(blob.y).toBe(WORLD_HEIGHT - BLOB_SIZE / 2)
  })

  it('leaves a still blob where it is', () => {
    const blobs = createBlobs()
    const blob = joinBlob(blobs, 'p1', 'Wilf')
    const spot = { x: blob.x, y: blob.y }
    tick(blobs, 1000)
    expect({ x: blob.x, y: blob.y }).toEqual(spot)
  })
})
