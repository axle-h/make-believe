import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import { BLOB_SIZE } from './constants.js'
import { createRng } from './rng.js'
import { activePlayers } from './selectors.js'
import { createGame } from './state.js'
import { blobsIn, contains, placeZone, radiusFor, zoneReach, type CircleZone, type RectZone } from './zones.js'

const spot: CircleZone = { id: 'z1', shape: 'circle', x: 100, y: 100, radius: 50, colour: '#fff' }
const pad: RectZone = { id: 'z2', shape: 'rect', x: 200, y: 200, width: 100, height: 60, colour: '#fff' }

describe('contains', () => {
  it('holds a blob standing on a circle, and not one beside it', () => {
    expect(contains(spot, 100, 100)).toBe(true)
    expect(contains(spot, 135, 135)).toBe(true)
    expect(contains(spot, 145, 145)).toBe(false)
  })

  it('counts the edge as in — a blob dead on the line is on the spot', () => {
    expect(contains(spot, 150, 100)).toBe(true)
    expect(contains(spot, 150.01, 100)).toBe(false)
  })

  it('holds a blob standing on a rectangle, and not one beside it', () => {
    expect(contains(pad, 200, 200)).toBe(true)
    expect(contains(pad, 249, 229)).toBe(true)
    expect(contains(pad, 251, 200)).toBe(false)
    expect(contains(pad, 200, 231)).toBe(false)
  })
})

describe('blobsIn', () => {
  it('says who is standing on it', () => {
    const state = createGame()
    applyMessage(state, { type: 'join', playerId: 'p1', name: 'Wilf' })
    applyMessage(state, { type: 'join', playerId: 'p2', name: 'Ida' })
    const [one, two] = activePlayers(state)
    one!.x = spot.x
    one!.y = spot.y
    two!.x = spot.x + 400
    two!.y = spot.y

    expect(blobsIn(spot, activePlayers(state)).map((blob) => blob.playerId)).toEqual(['p1'])
  })

  it('is empty when nobody is near it', () => {
    expect(blobsIn(spot, [])).toEqual([])
  })
})

describe('radiusFor', () => {
  it('grows with the number of blobs that have to fit', () => {
    expect(radiusFor(4, 1)).toBeGreaterThan(radiusFor(2, 1))
  })

  it('shrinks as the room gets less', () => {
    expect(radiusFor(4, 0.8)).toBeLessThan(radiusFor(4, 1.3))
  })

  it('fits two blobs side by side when there is room to spare', () => {
    // Two blobs standing shoulder to shoulder span two blob widths.
    expect(radiusFor(2, 1.4)).toBeGreaterThan(BLOB_SIZE)
  })

  it('never collapses to nothing for an empty room', () => {
    expect(radiusFor(0, 1)).toBeGreaterThan(0)
  })
})

describe('placeZone', () => {
  const bounds = { width: 1280, height: 720 }

  it('keeps a zone wholly inside the world, with room for a blob on it', () => {
    const rng = createRng(3)
    for (let i = 0; i < 200; i++) {
      const at = placeZone(rng, bounds, 90, [])
      expect(at.x).toBeGreaterThanOrEqual(90 + BLOB_SIZE / 2)
      expect(at.x).toBeLessThanOrEqual(bounds.width - 90 - BLOB_SIZE / 2)
      expect(at.y).toBeGreaterThanOrEqual(90 + BLOB_SIZE / 2)
      expect(at.y).toBeLessThanOrEqual(bounds.height - 90 - BLOB_SIZE / 2)
    }
  })

  it('keeps a new zone off the ones already down', () => {
    const rng = createRng(8)
    const placed: CircleZone[] = []
    for (let i = 0; i < 4; i++) {
      const at = placeZone(rng, bounds, 60, placed)
      placed.push({ id: `z${i}`, shape: 'circle', ...at, radius: 60, colour: '#fff' })
    }

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!
        const b = placed[j]!
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
          zoneReach(a) + zoneReach(b) + BLOB_SIZE,
        )
      }
    }
  })

  /**
   * Generation runs inside a frame. A world too crowded to place anything in
   * must give up and take a spot, because a generator that can loop forever
   * would stop the TV dead.
   */
  it('gives up rather than looping when nothing will fit', () => {
    const filled: CircleZone[] = [
      { id: 'huge', shape: 'circle', x: 640, y: 360, radius: 2000, colour: '#fff' },
    ]
    const at = placeZone(createRng(1), bounds, 60, filled)

    expect(Number.isFinite(at.x)).toBe(true)
    expect(Number.isFinite(at.y)).toBe(true)
  })
})
