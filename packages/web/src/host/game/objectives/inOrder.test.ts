import { SEQUENCES } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { stillOut, type Parcel } from '../carryables.js'
import { MAX_LEVEL } from '../constants.js'
import { insideObstacle } from '../obstacles.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { contains } from '../zones.js'
import { inOrder, type InOrderObjective, type Step } from './inOrder.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) joinPlayer(state, `p${index}`, `B${index}`)
  return state
}

function make(state: GameState, level = 7, seed = 5): InOrderObjective {
  return inOrder.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

const alike = (step: Step, other: Step): boolean =>
  step.colour === other.colour && (step.glyph ?? '') === (other.glyph ?? '')

const looks = (thing: { glyph?: string; colour: string }): Step =>
  thing.glyph === undefined || thing.glyph === '' ? { colour: thing.colour } : { glyph: thing.glyph, colour: thing.colour }

/** Carry one particular piece into the house, as driving it there does. */
function bring(state: GameState, objective: InOrderObjective, step: Step, by = 'p1'): Parcel {
  const piece = objective.carryables.find(
    (thing) => thing.home === null && alike(looks(thing), step),
  ) as Parcel
  if (!piece) throw new Error(`no ${step.glyph ?? step.colour} left on the floor`)
  const house = objective.zones[0]!
  const player = state.players.get(by)!
  player.x = house.x
  player.y = house.y
  piece.carriedBy = by
  piece.x = house.x
  piece.y = house.y
  inOrder.step(objective, state, 16)
  return piece
}

describe('laying it out', () => {
  it('puts one piece on the floor for every step of the sequence', () => {
    const objective = make(room(2))
    const sequence = SEQUENCES.find((one) => one.name === objective.making)

    expect(sequence).toBeDefined()
    expect(objective.carryables).toHaveLength(sequence?.steps.length ?? 0)
    expect(objective.steps).toEqual(sequence?.steps)
    expect(objective.headline).toBe(`Make the ${objective.making}!`)
  })

  it('shows the first thing it wants, large and in its colour', () => {
    const objective = make(room(2))
    const house = objective.zones[0]

    expect(house?.label).toBe(objective.steps[0]?.glyph ?? '')
    expect(house?.colour).toBe(objective.steps[0]?.colour)
    expect(house?.labelSize).toBeGreaterThan(40)
  })

  it('says what it wants by colour alone when the pieces have no pictures', () => {
    let objective = make(room(2))
    for (let seed = 0; seed < 20 && objective.making !== 'traffic light'; seed++) {
      objective = make(room(2), 7, seed)
    }
    expect(objective.making).toBe('traffic light')

    expect(objective.steps.every((step) => step.glyph === undefined)).toBe(true)
    expect(new Set(objective.steps.map((step) => step.colour)).size).toBe(3)
    expect(objective.zones[0]?.colour).toBe(objective.steps[0]?.colour)
  })

  it('starts nothing off at home', () => {
    for (let seed = 0; seed < 12; seed++) {
      const objective = make(room(2), 7, seed)
      const house = objective.zones[0]!
      for (const piece of objective.carryables) {
        expect(piece.home).toBeNull()
        expect(contains(house, piece.x, piece.y)).toBe(false)
      }
    }
  })
})

describe('making it', () => {
  it('takes them one at a time, in order, and is done at the end', () => {
    const state = room(2)
    const objective = make(state)

    for (const [index, step] of objective.steps.entries()) {
      expect(objective.outcome).toBe('running')
      bring(state, objective, step)
      expect(objective.position).toBe(index + 1)
    }

    expect(objective.outcome).toBe('done')
    expect(stillOut(objective.carryables)).toHaveLength(0)
  })

  it('shows the next thing it wants as soon as one arrives', () => {
    const state = room(2)
    const objective = make(state)
    bring(state, objective, objective.steps[0] as Step)

    expect(objective.zones[0]?.label).toBe(objective.steps[1]?.glyph ?? '')
    expect(objective.zones[0]?.colour).toBe(objective.steps[1]?.colour)
  })

  it('drops one brought out of turn where it stands, and does not advance', () => {
    const state = room(2)
    const objective = make(state)
    const first = objective.steps[0] as Step
    const later = objective.steps.find((step) => !alike(step, first))
    if (!later) throw new Error('expected a sequence of more than one picture')

    const piece = bring(state, objective, later)

    expect(objective.position).toBe(0)
    expect(piece.home).toBeNull()
    expect(piece.carriedBy).toBeNull()
    expect(objective.zones[0]?.label).toBe(first.glyph ?? '')
    // And the right one still works straight afterwards.
    bring(state, objective, first)
    expect(objective.position).toBe(1)
  })

  it('blips the phone that brought it, and nobody else', () => {
    const state = room(2)
    const objective = make(state)
    const first = objective.steps[0] as Step
    const later = objective.steps.find((step) => !alike(step, first)) as Step
    state.objectives.sounds = []

    bring(state, objective, later, 'p2')

    expect(state.objectives.sounds).toEqual([{ to: 'p2', cue: 'miss' }])
  })

  /** Matching is by how a thing looks, never by which parcel it is. */
  it('takes either of two pieces that look the same', () => {
    const state = room(2)
    let objective = make(state)
    const twice = (one: InOrderObjective) =>
      one.steps.find((step, at) => one.steps.findIndex((other) => alike(step, other)) !== at)
    for (let seed = 0; seed < 20 && !twice(objective); seed++) {
      objective = make(state, 7, seed)
    }
    const repeated = twice(objective)
    if (!repeated) throw new Error('expected a sequence with a step in it twice')

    const both = objective.carryables.filter((thing) => alike(looks(thing), repeated))
    expect(both.length).toBeGreaterThan(1)

    bring(state, objective, repeated)
    expect(objective.position).toBe(1)
  })

  it('drops what a blob was carrying when its phone goes', () => {
    const state = room(2)
    const objective = make(state)
    const piece = objective.carryables[0] as Parcel
    piece.carriedBy = 'p1'
    state.players.delete('p1')

    inOrder.step(objective, state, 16)

    expect(piece.carriedBy).toBeNull()
    expect(piece.home).toBeNull()
  })
})

describe('what the phones are told', () => {
  it('counts how far along it is, for the room', () => {
    const state = room(2)
    const objective = make(state)
    bring(state, objective, objective.steps[0] as Step)

    const [brief] = inOrder.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.detail).toContain(`1 of ${objective.steps.length}`)
  })

  it('is on the ladder above the game it is built out of', () => {
    expect(inOrder.minPlayers).toBe(2)
    expect(inOrder.minLevel).toBeGreaterThan(4)
    expect(inOrder.minLevel).toBeLessThanOrEqual(MAX_LEVEL)
  })
})

describe('in order: what is in the way', () => {
  it('gives a room at the top of the ladder something to carry things round', () => {
    let seen = 0
    for (let seed = 0; seed < 20; seed++) seen += make(room(3), MAX_LEVEL, seed).obstacles.length
    expect(seen).toBeGreaterThan(0)
  })

  it('gives a room low down the ladder a clear floor', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(make(room(3), 4, seed).obstacles).toEqual([])
    }
  })

  it('never starts a piece inside a wall', () => {
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
