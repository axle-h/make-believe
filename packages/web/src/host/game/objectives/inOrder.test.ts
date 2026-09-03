import { SEQUENCES } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { stillOut, type Parcel } from '../carryables.js'
import { MAX_LEVEL } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { contains } from '../zones.js'
import { inOrder, type InOrderObjective } from './inOrder.js'

/**
 * Bread, cheese, bread. The house asks for one at a time by showing it, and
 * something brought out of turn is put down where it stands — not a penalty,
 * not a reset, just not yet.
 */

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

/** Carry one particular piece into the house, as driving it there does. */
function bring(state: GameState, objective: InOrderObjective, glyph: string, by = 'p1'): Parcel {
  const piece = objective.carryables.find(
    (thing) => thing.glyph === glyph && thing.home === null,
  ) as Parcel
  if (!piece) throw new Error(`no ${glyph} left on the floor`)
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
    expect(objective.steps).toEqual(sequence?.steps.map((step) => step.glyph))
    expect(objective.headline).toBe(`Make the ${objective.making}!`)
  })

  /** The picture on the house is the whole instruction, so it is drawn like one. */
  it('shows the first thing it wants, large', () => {
    const objective = make(room(2))
    const house = objective.zones[0]

    expect(house?.label).toBe(objective.steps[0])
    expect(house?.labelSize).toBeGreaterThan(40)
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

    for (const [index, glyph] of objective.steps.entries()) {
      expect(objective.outcome).toBe('running')
      bring(state, objective, glyph)
      expect(objective.position).toBe(index + 1)
    }

    expect(objective.outcome).toBe('done')
    expect(stillOut(objective.carryables)).toHaveLength(0)
  })

  it('shows the next thing it wants as soon as one arrives', () => {
    const state = room(2)
    const objective = make(state)
    bring(state, objective, objective.steps[0] as string)

    expect(objective.zones[0]?.label).toBe(objective.steps[1])
  })

  /**
   * The whole of the game. Nothing is lost, nothing is undone, nothing is
   * reset: the piece is put down where it stands and the room tries again.
   */
  it('drops one brought out of turn where it stands, and does not advance', () => {
    const state = room(2)
    const objective = make(state)
    // Something that is not what the house is showing.
    const later = objective.steps.find((glyph) => glyph !== objective.steps[0])
    if (!later) throw new Error('expected a sequence of more than one picture')

    const piece = bring(state, objective, later)

    expect(objective.position).toBe(0)
    expect(piece.home).toBeNull()
    expect(piece.carriedBy).toBeNull()
    expect(objective.zones[0]?.label).toBe(objective.steps[0])
    // And the right one still works straight afterwards.
    bring(state, objective, objective.steps[0] as string)
    expect(objective.position).toBe(1)
  })

  it('blips the phone that brought it, and nobody else', () => {
    const state = room(2)
    const objective = make(state)
    const later = objective.steps.find((glyph) => glyph !== objective.steps[0]) as string
    state.objectives.sounds = []

    bring(state, objective, later, 'p2')

    expect(state.objectives.sounds).toEqual([{ to: 'p2', cue: 'miss' }])
  })

  /**
   * A sandwich has two slices of bread, and a child who fetched the far one
   * has not made a mistake. Matching is by picture, never by which parcel.
   */
  it('takes either of two pieces that look the same', () => {
    const state = room(2)
    let objective = make(state)
    for (let seed = 0; seed < 12 && new Set(objective.steps).size === objective.steps.length; seed++) {
      objective = make(state, 7, seed)
    }
    if (new Set(objective.steps).size === objective.steps.length) return

    const repeated = objective.steps.find(
      (glyph, at) => objective.steps.indexOf(glyph) !== at,
    ) as string
    const both = objective.carryables.filter((thing) => thing.glyph === repeated)
    expect(both.length).toBeGreaterThan(1)

    // The far one, brought first, is accepted exactly as the near one is.
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
    bring(state, objective, objective.steps[0] as string)

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
