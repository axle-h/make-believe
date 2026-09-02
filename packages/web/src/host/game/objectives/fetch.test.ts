import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { stillOut, type Parcel } from '../carryables.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { contains } from '../zones.js'
import { fetch, type FetchObjective } from './fetch.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `Blob ${index}` })
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
  })
}

/**
 * Drive a blob to a thing and on to the depot, exactly as a child would —
 * except that a parcel somebody else has already picked up is theirs to
 * deliver, which is how it works on the floor as well.
 */
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
    expect(brief?.colour).toBe(objective.zones[0]?.colour)
  })
})
