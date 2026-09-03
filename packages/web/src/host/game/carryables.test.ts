import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import {
  CRATE_SIZE,
  deliverInto,
  drop,
  stepCarryables,
  stillOut,
  type Carryable,
  type Crate,
  type Parcel,
} from './carryables.js'
import { SPEED } from './constants.js'
import { insideObstacle, type Box } from './obstacles.js'
import { createGame, type GameState } from './state.js'
import type { CircleZone } from './zones.js'
import { joinPlayer } from './testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

function parcel(x: number, y: number, colour = '#f6f0e2'): Parcel {
  return { kind: 'parcel', id: `parcel-${x}-${y}`, x, y, colour, home: null, carriedBy: null }
}

function crate(x: number, y: number): Crate {
  return { kind: 'crate', id: 'crate', x, y, colour: '#f6f0e2', home: null, pushedBy: [] }
}

/** Put a blob exactly where you want it, exactly as driving there would. */
function put(state: GameState, playerId: string, x: number, y: number, dx = 0, dy = 0): void {
  const player = state.players.get(playerId)!
  player.x = x
  player.y = y
  player.dx = dx
  player.dy = dy
}

const DEPOT: CircleZone = { id: 'depot', shape: 'circle', x: 1000, y: 600, radius: 120, colour: '#8de0ff' }

/** The crate as the rectangle the separation works on. */
function boxOf(thing: Carryable): Box {
  return { x: thing.x, y: thing.y, width: CRATE_SIZE, height: CRATE_SIZE }
}

/** Drive a blob across the floor exactly as `tick` would, a frame at a time. */
function drive(
  state: GameState,
  things: Carryable[],
  playerId: string,
  dx: number,
  dy: number,
  frames: number,
): void {
  const player = state.players.get(playerId)!
  player.dx = dx
  player.dy = dy
  for (let frame = 0; frame < frames; frame++) {
    player.x += dx * SPEED * 0.016
    player.y += dy * SPEED * 0.016
    stepCarryables(state, things, 16)
  }
}

describe('picking a parcel up', () => {
  it('is done by driving into it, with nothing to press', () => {
    const state = room(2)
    const things: Carryable[] = [parcel(300, 300)]
    put(state, 'p1', 300, 300)

    stepCarryables(state, things, 16)

    expect((things[0] as Parcel).carriedBy).toBe('p1')
  })

  it('leaves a parcel nobody is near where it is', () => {
    const state = room(2)
    const things: Carryable[] = [parcel(300, 300)]
    put(state, 'p1', 900, 100)

    stepCarryables(state, things, 16)

    expect((things[0] as Parcel).carriedBy).toBeNull()
    expect(things[0]).toMatchObject({ x: 300, y: 300 })
  })

  it('follows whoever has it about the floor', () => {
    const state = room(2)
    const things: Carryable[] = [parcel(300, 300)]
    put(state, 'p1', 300, 300)
    stepCarryables(state, things, 16)

    put(state, 'p1', 500, 200)
    stepCarryables(state, things, 16)

    expect(things[0]).toMatchObject({ x: 500, y: 200 })
  })

  it('is one parcel each: a blob with its hands full picks up nothing else', () => {
    const state = room(1)
    const things: Carryable[] = [parcel(300, 300), parcel(300, 300)]
    put(state, 'p1', 300, 300)

    stepCarryables(state, things, 16)

    expect((things[0] as Parcel).carriedBy).toBe('p1')
    expect((things[1] as Parcel).carriedBy).toBeNull()
  })

  it('is not taken off somebody who already has it', () => {
    const state = room(2)
    const things: Carryable[] = [parcel(300, 300)]
    put(state, 'p1', 300, 300)
    stepCarryables(state, things, 16)

    put(state, 'p2', 300, 300)
    stepCarryables(state, things, 16)

    expect((things[0] as Parcel).carriedBy).toBe('p1')
  })

  /**
   * Children wander off holding things. The parcel is left exactly where it
   * was let go of, for somebody else to find — never carried off screen by a
   * blob nobody is driving.
   */
  it('is put down where it stands when the phone carrying it goes away', () => {
    const state = room(2)
    const things: Carryable[] = [parcel(300, 300)]
    put(state, 'p1', 300, 300)
    stepCarryables(state, things, 16)
    put(state, 'p1', 700, 400)
    stepCarryables(state, things, 16)

    applyMessage(state, { type: 'left', playerId: 'p1' })
    stepCarryables(state, things, 16)

    expect((things[0] as Parcel).carriedBy).toBeNull()
    expect(things[0]).toMatchObject({ x: 700, y: 400 })
  })

  it('can be put down on purpose', () => {
    const things: Carryable[] = [parcel(300, 300)]
    ;(things[0] as Parcel).carriedBy = 'p1'

    drop(things[0]!)

    expect((things[0] as Parcel).carriedBy).toBeNull()
  })
})

/**
 * The crate is solid and a parcel is not, and that is on purpose: driving into
 * a parcel is how you pick it up, and a parcel you bounce off is a parcel a
 * three-year-old cannot collect.
 */
describe('a parcel is not solid', () => {
  it('lets a blob drive right onto it and carry it away', () => {
    const state = room(2)
    const things: Carryable[] = [parcel(600, 400)]
    put(state, 'p1', 300, 400, 1, 0)

    drive(state, things, 'p1', 1, 0, 120)

    const driver = state.players.get('p1')!
    expect(driver.x).toBeGreaterThan(600)
    expect((things[0] as Parcel).carriedBy).toBe('p1')
    expect(things[0]!.x).toBe(driver.x)
  })
})

describe('delivering it', () => {
  it('is home once it is in the right zone, and stays there', () => {
    const state = room(2)
    const things: Carryable[] = [parcel(DEPOT.x, DEPOT.y)]
    put(state, 'p1', DEPOT.x, DEPOT.y)
    stepCarryables(state, things, 16)

    deliverInto(things, [DEPOT], () => true)

    expect(things[0]?.home).toBe('depot')
    expect((things[0] as Parcel).carriedBy).toBeNull()
    expect(stillOut(things)).toEqual([])

    // ...and driving back through the depot does not pick it up again.
    stepCarryables(state, things, 16)
    expect((things[0] as Parcel).carriedBy).toBeNull()
  })

  it('only counts the zone it belongs in', () => {
    const things: Carryable[] = [parcel(DEPOT.x, DEPOT.y, '#ffe08a')]

    deliverInto(things, [DEPOT], (thing, zone) => thing.colour === zone.colour)

    expect(things[0]?.home).toBeNull()
    expect(stillOut(things)).toHaveLength(1)
  })
})

describe('a crate', () => {
  it('does not budge for one blob, however hard it drives', () => {
    const state = room(2)
    const things: Carryable[] = [crate(600, 400)]
    put(state, 'p1', 520, 400, 1, 0)

    stepCarryables(state, things, 1000)

    expect(things[0]).toMatchObject({ x: 600, y: 400 })
    expect((things[0] as Crate).pushedBy).toEqual(['p1'])
  })

  it('moves for two, by what the two of them are asking for between them', () => {
    const state = room(2)
    const things: Carryable[] = [crate(600, 400)]
    put(state, 'p1', 520, 400, 1, 0)
    put(state, 'p2', 600, 320, 1, 0)

    stepCarryables(state, things, 1000)

    expect(things[0]!.x).toBeGreaterThan(600)
    expect(things[0]!.y).toBe(400)
  })

  /** Two children pulling opposite ways get exactly what they deserve. */
  it('goes nowhere while the two of them disagree', () => {
    const state = room(2)
    const things: Carryable[] = [crate(600, 400)]
    put(state, 'p1', 520, 400, 1, 0)
    put(state, 'p2', 680, 400, -1, 0)

    stepCarryables(state, things, 1000)

    expect(things[0]).toMatchObject({ x: 600, y: 400 })
  })

  /**
   * "Push it together" is the one task built on a thing being in the way, and
   * for a while the thing was not in the way at all: blobs drove straight
   * through the crate, which the second play test reported before anybody had
   * managed to push one anywhere.
   */
  it('is solid: one blob driving flat out at it neither enters it nor shifts it', () => {
    const state = room(2)
    const things: Carryable[] = [crate(600, 400)]
    put(state, 'p1', 300, 400, 1, 0)

    drive(state, things, 'p1', 1, 0, 120)

    expect(things[0]).toMatchObject({ x: 600, y: 400 })
    expect(insideObstacle(boxOf(things[0]!), state.players.get('p1')!.x, 400)).toBe(false)
  })

  /**
   * Two blobs drive at 420 and a crate goes at 200, so the separation is what
   * keeps them leaning on it: it puts them exactly a half-blob and a half-crate
   * off, and `touching` reaches a little past that. Without it they would be
   * inside the crate one frame and past it the next.
   */
  it('keeps its pushers in contact the whole way across the floor', () => {
    const state = room(2)
    const things: Carryable[] = [crate(300, 400)]
    put(state, 'p1', 200, 360, 1, 0)
    put(state, 'p2', 200, 440, 1, 0)
    let leaning = 0

    for (let frame = 0; frame < 150; frame++) {
      for (const id of ['p1', 'p2']) state.players.get(id)!.x += SPEED * 0.016
      stepCarryables(state, things, 16)
      // Once they are on it they stay on it: contact is never handed back.
      if ((things[0] as Crate).pushedBy.length === 2) leaning += 1
      else expect(leaning).toBe(0)
    }

    expect(leaning).toBeGreaterThan(120)
    expect(things[0]!.x).toBeGreaterThan(600)
  })

  /** A crate shoves a blob aside rather than swallowing it. */
  it('slides a blob standing in its way out rather than over it', () => {
    const state = room(3)
    const things: Carryable[] = [crate(300, 400)]
    put(state, 'p1', 200, 360, 1, 0)
    put(state, 'p2', 200, 440, 1, 0)
    put(state, 'p3', 600, 400)

    for (let frame = 0; frame < 150; frame++) {
      for (const id of ['p1', 'p2']) state.players.get(id)!.x += SPEED * 0.016
      stepCarryables(state, things, 16)
    }

    const shoved = state.players.get('p3')!
    expect(things[0]!.x).toBeGreaterThan(600)
    expect(insideObstacle(boxOf(things[0]!), shoved.x, shoved.y)).toBe(false)
  })

  it('stays on the floor, whatever they do to it', () => {
    const state = room(2)
    const things: Carryable[] = [crate(200, 200)]
    put(state, 'p1', 280, 200, -1, -1)
    put(state, 'p2', 200, 280, -1, -1)

    for (let step = 0; step < 20; step++) stepCarryables(state, things, 500)

    expect(things[0]!.x).toBeGreaterThan(0)
    expect(things[0]!.y).toBeGreaterThan(0)
  })
})
