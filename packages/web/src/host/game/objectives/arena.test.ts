import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, MAX_LEVEL, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { insideObstacle } from '../obstacles.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { zoneReach, type CircleZone, type Zone } from '../zones.js'
import { litter, LITTER_FROM, walls } from './arena.js'
import { difficulty, type GenerateContext } from './types.js'

/**
 * Things to drive round. A chase across an empty room is a straight line, and
 * carrying an apple across an empty floor is the same straight line — so both
 * shapes of task get something in the way, and neither may ever get something
 * a child cannot get out from behind.
 */

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) joinPlayer(state, `p${index}`, `B${index}`)
  return state
}

function context(state: GameState, seed = 3): GenerateContext {
  return {
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level: MAX_LEVEL,
    players: activePlayers(state),
    crown: null,
  }
}

/** A pad somewhere on the floor, to be kept clear of. */
function pad(id: string, x: number, y: number, radius = 90): CircleZone {
  return { id, shape: 'circle', x, y, radius, colour: '#f6f0e2' }
}

/** How much of the ladder a given rung is, which is what `litter` is gated on. */
const hardAt = (level: number) => difficulty(level, MAX_LEVEL)

describe('the arena', () => {
  it('always puts something down for the two chases to go round', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(walls(context(room(4), seed), 0.5).length).toBeGreaterThan(0)
    }
  })

  it('keeps all of it inside the floor', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const wall of walls(context(room(4), seed), 1)) {
        expect(wall.x - wall.width / 2).toBeGreaterThanOrEqual(0)
        expect(wall.y - wall.height / 2).toBeGreaterThanOrEqual(0)
        expect(wall.x + wall.width / 2).toBeLessThanOrEqual(WORLD_WIDTH)
        expect(wall.y + wall.height / 2).toBeLessThanOrEqual(WORLD_HEIGHT)
      }
    }
  })
})

describe('the litter', () => {
  /**
   * Fetch unlocks at level 4, so it gets a clear floor on its first outing and
   * picks corners up later. A four-year-old carrying an apple round a corner is
   * a game; one who cannot find the corner is not.
   */
  it('is nothing at all until the room is halfway up the ladder', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const hard = hardAt(level)
      const made = litter(context(room(4)), hard, [])
      if (hard < LITTER_FROM) expect(made).toEqual([])
      else expect(made.length).toBeGreaterThan(0)
    }
  })

  it('puts more down as the room gets better', () => {
    const early = litter(context(room(4)), LITTER_FROM, [])
    const late = litter(context(room(4)), 1, [])

    expect(late.length).toBeGreaterThan(early.length)
  })

  /** A wall on top of a house is a house nobody can deliver to. */
  it('never lands on a zone it was given', () => {
    const zones: Zone[] = [pad('a', 300, 200), pad('b', 900, 500)]
    for (let seed = 0; seed < 30; seed++) {
      for (const wall of litter(context(room(4), seed), 1, zones)) {
        for (const zone of zones) {
          const gap = Math.hypot(zone.x - wall.x, zone.y - wall.y)
          expect(gap).toBeGreaterThan(zoneReach(zone) + Math.max(wall.width, wall.height) / 2)
        }
      }
    }
  })

  it('never lands on another bit of litter', () => {
    for (let seed = 0; seed < 30; seed++) {
      const made = litter(context(room(4), seed), 1, [])
      for (const one of made) {
        for (const other of made) {
          if (one === other) continue
          expect(insideObstacle(other, one.x, one.y)).toBe(false)
        }
      }
    }
  })

  /** Small — a blob and a bit — and plainly a wall rather than a room divider. */
  it('keeps every piece of it small, and inside the floor', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const wall of litter(context(room(4), seed), 1, [])) {
        expect(wall.width).toBeLessThanOrEqual(BLOB_SIZE * 1.5)
        expect(wall.height).toBeLessThanOrEqual(BLOB_SIZE * 1.5)
        expect(wall.x - wall.width / 2).toBeGreaterThanOrEqual(0)
        expect(wall.y - wall.height / 2).toBeGreaterThanOrEqual(0)
        expect(wall.x + wall.width / 2).toBeLessThanOrEqual(WORLD_WIDTH)
        expect(wall.y + wall.height / 2).toBeLessThanOrEqual(WORLD_HEIGHT)
      }
    }
  })

  /** Motionless and unrotated, so `mergeWalls` may be run over the lot. */
  it('makes nothing that moves or is turned', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const wall of litter(context(room(4), seed), 1, [])) {
        expect(wall.motion).toBeUndefined()
        expect(wall.angle).toBeUndefined()
      }
    }
  })
})
