import { THEMES } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { stillOut, type Parcel } from '../carryables.js'
import { insideObstacle } from '../obstacles.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { MAX_LEVEL, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { createGame, type GameState } from '../state.js'
import { contains, roofHeight } from '../zones.js'
import { fetch, type FetchObjective } from './fetch.js'
import { joinPlayer } from '../testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

function make(state: GameState, level = 4, seed = 61): FetchObjective {
  return fetch.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

/** Drive a blob to a parcel and on to the depot; one already carried is delivered by its carrier. */
function fetchOne(state: GameState, objective: FetchObjective, playerId: string, parcel: Parcel): void {
  const depot = objective.zones[0]!
  const player = state.players.get(parcel.carriedBy ?? playerId)!
  if (parcel.carriedBy === null) {
    player.x = parcel.x
    player.y = parcel.y
    fetch.step(objective, state, 16)
  }
  player.x = depot.x
  player.y = depot.y
  fetch.step(objective, state, 16)
}

describe('the depot', () => {
  it('is a house, and stays wholly on the floor with its roof on', () => {
    for (let seed = 0; seed < 20; seed++) {
      const depot = make(room(3), 4, seed).zones[0]!
      expect(depot.shape).toBe('house')
      if (depot.shape !== 'house') continue

      expect(depot.x - depot.width / 2).toBeGreaterThan(0)
      expect(depot.x + depot.width / 2).toBeLessThan(WORLD_WIDTH)
      expect(depot.y - depot.height / 2 - roofHeight(depot)).toBeGreaterThan(0)
      expect(depot.y + depot.height / 2).toBeLessThan(WORLD_HEIGHT)
    }
  })

  /** A parcel is home when it is in the house, not when it is under the eaves. */
  it('takes a parcel in its body and not in its roof', () => {
    const depot = make(room(3)).zones[0]!
    if (depot.shape !== 'house') throw new Error('the depot should be a house')

    expect(contains(depot, depot.x, depot.y)).toBe(true)
    expect(contains(depot, depot.x, depot.y - depot.height / 2 - roofHeight(depot) / 2)).toBe(false)
  })
})

describe('scattering the parcels', () => {
  it('puts them on the floor, and never already in the depot', () => {
    for (let seed = 0; seed < 20; seed++) {
      const objective = make(room(3), 4, seed)
      const depot = objective.zones[0]!
      expect(objective.carryables.length).toBeGreaterThanOrEqual(2)
      for (const parcel of objective.carryables) {
        expect(contains(depot, parcel.x, parcel.y)).toBe(false)
        expect(parcel.home).toBeNull()
      }
    }
  })

  it('asks for more of them as the level goes up', () => {
    expect(make(room(3), 8).carryables.length).toBeGreaterThan(make(room(3), 1).carryables.length)
  })
})

describe('fetching', () => {
  it('is picked up by driving into it and delivered by driving home', () => {
    const state = room(2)
    const objective = make(state)
    const first = objective.carryables[0] as Parcel

    fetchOne(state, objective, 'p1', first)

    expect(first.home).toBe(objective.zones[0]?.id)
    expect(first.carriedBy).toBeNull()
  })

  it('is done only when every last one is home', () => {
    const state = room(2)
    const objective = make(state)

    for (const parcel of [...objective.carryables] as Parcel[]) {
      expect(objective.outcome).toBe('running')
      fetchOne(state, objective, 'p1', parcel)
    }

    expect(stillOut(objective.carryables)).toEqual([])
    expect(objective.outcome).toBe('done')
  })

  it('lets two blobs carry one each at the same time', () => {
    const state = room(2)
    const objective = make(state)
    const [one, two] = objective.carryables as Parcel[]
    state.players.get('p1')!.x = one!.x
    state.players.get('p1')!.y = one!.y
    state.players.get('p2')!.x = two!.x
    state.players.get('p2')!.y = two!.y

    fetch.step(objective, state, 16)

    expect(one?.carriedBy).toBe('p1')
    expect(two?.carriedBy).toBe('p2')
  })

  it('counts what is left, for the room to hear', () => {
    const state = room(2)
    const objective = make(state)
    fetchOne(state, objective, 'p1', objective.carryables[0] as Parcel)

    const [brief] = fetch.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.detail).toContain(`1 of ${objective.parcels}`)
    expect(brief?.detail).toContain(objective.home)
    // The strip is the colour of the things, not of the house.
    expect(brief?.colour).toBe(objective.thingColour)
    expect(brief?.emphasis).toBe(objective.things)
    expect(brief?.headline).toContain(objective.things)
  })
})

describe('what is being carried', () => {
  it('gives every parcel the same picture, and the house one of its own', () => {
    const objective = make(room(2))

    const glyphs = new Set(objective.carryables.map((thing) => thing.glyph))
    expect(glyphs.size).toBe(1)
    expect([...glyphs][0]).toBeTruthy()
    expect(objective.zones[0]?.label).toBeTruthy()
    expect(objective.zones[0]?.label).not.toBe([...glyphs][0])
  })

  it('takes them all from one theme, so it is never apples in a postbox', () => {
    for (let seed = 0; seed < 20; seed++) {
      const objective = make(room(2), 4, seed)
      const theme = THEMES.find((one) => one.things === objective.things)

      expect(theme).toBeDefined()
      expect(objective.thingColour).toBe(theme?.colour)
      expect(objective.carryables[0]?.glyph).toBe(theme?.glyph)
      expect(objective.zones[0]?.label).toBe(theme?.homeGlyph)
      expect(objective.headline).toBe(`Take the ${theme?.things} home!`)
      expect(objective.home).toBe(theme?.home)
    }
  })

  it('draws the house picture big enough to read across a room', () => {
    expect(make(room(2)).zones[0]?.labelSize).toBeGreaterThan(40)
  })
})

describe('fetching: what is in the way', () => {
  it('gives a room at the top of the ladder something to carry things round', () => {
    let seen = 0
    for (let seed = 0; seed < 20; seed++) seen += make(room(3), MAX_LEVEL, seed).obstacles.length
    expect(seen).toBeGreaterThan(0)
  })

  it('gives a room on its first outing a clear floor', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(make(room(3), 4, seed).obstacles).toEqual([])
    }
  })

  it('never starts a parcel inside a wall', () => {
    for (let seed = 0; seed < 20; seed++) {
      const objective = make(room(3), MAX_LEVEL, seed)
      for (const thing of objective.carryables) {
        for (const wall of objective.obstacles) {
          expect(insideObstacle(wall, thing.x, thing.y)).toBe(false)
        }
      }
    }
  })
})
