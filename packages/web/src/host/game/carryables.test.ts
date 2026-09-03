import { describe, expect, it } from 'vitest'
import { applyMessage } from './apply.js'
import {
  deliverInto,
  drop,
  stepCarryables,
  stillOut,
  type Carryable,
  type Crate,
  type Parcel,
} from './carryables.js'
import { createGame, type GameState } from './state.js'
import type { CircleZone } from './zones.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `B${index}` })
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
