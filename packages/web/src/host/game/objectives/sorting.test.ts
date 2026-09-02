import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { stillOut, type Parcel } from '../carryables.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { contains, type Zone } from '../zones.js'
import { sorting, type SortingObjective } from './sorting.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `Blob ${index}` })
  }
  return state
}

function make(state: GameState, level = 6, seed = 71): SortingObjective {
  return sorting.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
  })
}

function depotFor(objective: SortingObjective, parcel: Parcel): Zone {
  const depot = objective.zones.find((zone) => zone.colour === parcel.colour)
  if (!depot) throw new Error('every parcel must have somewhere to go')
  return depot
}

/** Carry one parcel to a spot, whichever spot the test asks for. */
function carryTo(state: GameState, objective: SortingObjective, parcel: Parcel, zone: Zone): void {
  const player = state.players.get(parcel.carriedBy ?? 'p1')!
  if (parcel.carriedBy === null) {
    player.x = parcel.x
    player.y = parcel.y
    sorting.step(objective, state, 16)
  }
  player.x = zone.x
  player.y = zone.y
  sorting.step(objective, state, 16)
}

describe('setting it out', () => {
  it('gives every parcel somewhere it belongs, and starts it somewhere else', () => {
    for (let seed = 0; seed < 20; seed++) {
      const objective = make(room(3), 6, seed)
      expect(objective.zones.length).toBeGreaterThanOrEqual(2)
      for (const parcel of objective.carryables) {
        expect(objective.zones.some((zone) => zone.colour === parcel.colour)).toBe(true)
        expect(objective.zones.some((zone) => contains(zone, parcel.x, parcel.y))).toBe(false)
      }
    }
  })

  it('gives every depot something to receive', () => {
    const objective = make(room(3))
    const wanted = new Set(objective.carryables.map((parcel) => parcel.colour))

    for (const zone of objective.zones) expect(wanted.has(zone.colour)).toBe(true)
  })
})

describe('sorting', () => {
  it('takes a parcel only on a spot of its own colour', () => {
    const state = room(2)
    const objective = make(state)
    const parcel = objective.carryables[0] as Parcel
    const wrong = objective.zones.find((zone) => zone.colour !== parcel.colour)
    if (!wrong) throw new Error('expected a second colour')

    carryTo(state, objective, parcel, wrong)

    expect(parcel.home).toBeNull()
    // ...and it is still being carried, so it can be taken on to the right one.
    expect(parcel.carriedBy).toBe('p1')

    carryTo(state, objective, parcel, depotFor(objective, parcel))

    expect(parcel.home).toBe(depotFor(objective, parcel).id)
  })

  it('is done once everything is where it belongs', () => {
    const state = room(2)
    const objective = make(state)

    for (const parcel of [...objective.carryables] as Parcel[]) {
      expect(objective.outcome).toBe('running')
      carryTo(state, objective, parcel, depotFor(objective, parcel))
    }

    expect(stillOut(objective.carryables)).toEqual([])
    expect(objective.outcome).toBe('done')
  })

  it('counts what is sorted, for the room to hear', () => {
    const state = room(2)
    const objective = make(state)

    const [brief] = sorting.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.detail).toContain(`0 of ${objective.parcels}`)
  })
})
