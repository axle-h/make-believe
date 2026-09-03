import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { findYourColour, type FindYourColourObjective } from './findYourColour.js'
import { nameOfColour } from './pads.js'
import { joinPlayer } from '../testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

function make(state: GameState, level = 4, seed = 21): FindYourColourObjective {
  return findYourColour.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

/** Drive each of these blobs onto the pad it was privately told about. */
function goHome(state: GameState, objective: FindYourColourObjective, ids: string[]): void {
  for (const id of ids) {
    const player = state.players.get(id)!
    const zone = objective.zones.find((pad) => pad.id === objective.homes[id])!
    player.x = zone.x
    player.y = zone.y
  }
}

/** What one phone was told, and nobody else. */
function lineTo(objective: FindYourColourObjective, state: GameState, playerId: string) {
  return findYourColour.briefs(objective, state).find((brief) => brief.to === playerId)
}

describe('handing out the pads', () => {
  it('gives everybody a pad painted their own colour', () => {
    const state = room(6)
    const objective = make(state)

    expect(objective.zones).toHaveLength(6)
    for (const player of activePlayers(state)) {
      const pad = objective.zones.find((zone) => zone.id === objective.homes[player.playerId])
      expect(pad?.colour).toBe(player.colour)
    }
  })

  it('puts two blobs of the same colour on one pad between them', () => {
    const state = room(3)
    // More blobs than there are colours is the only way this happens for real,
    // and eight of them is a slow test; wearing somebody else's is the same
    // thing as far as the floor is concerned.
    state.players.get('p2')!.colour = state.players.get('p1')!.colour
    const objective = make(state)

    expect(objective.zones).toHaveLength(2)
    expect(objective.homes['p2']).toBe(objective.homes['p1'])
  })

  it('sends a blob wearing a colour no pad has to the nearest one going', () => {
    const state = room(2)
    const objective = make(state)
    joinPlayer(state, 'p3', 'Ted')
    const latecomer = state.players.get('p3')!
    latecomer.colour = '#4fa9fe'

    findYourColour.step(objective, state, 16)

    const pad = objective.zones.find((zone) => zone.id === objective.homes['p3'])
    // Practically the blue one, which is the pad it should have been sent to.
    expect(pad?.colour).toBe('#4ea8ff')
  })

  it('makes the same world twice from the same seed', () => {
    expect(make(room(3)).zones).toEqual(make(room(3)).zones)
  })
})

describe('the line only your phone gets', () => {
  it('tells each phone its own colour, and tints the strip with it', () => {
    const state = room(3)
    const objective = make(state)

    for (const player of activePlayers(state)) {
      const brief = lineTo(objective, state, player.playerId)
      const pad = objective.zones.find((zone) => zone.id === objective.homes[player.playerId])!
      expect(brief?.detail).toBe(`Yours is the ${nameOfColour(pad.colour)} pad`)
      expect(brief?.colour).toBe(pad.colour)
    }
  })

  it('still says the same thing to the room, so the TV has a line too', () => {
    const state = room(3)
    const objective = make(state)
    const everybody = findYourColour.briefs(objective, state).filter((brief) => brief.to === '*')

    expect(everybody).toHaveLength(1)
    expect(everybody[0]?.detail).toBe('0 of 3 home')
  })

  /**
   * The hard version tells each phone where *somebody else* goes, so the only
   * way anybody learns their own pad is if the room says it out loud. Nobody is
   * told about themselves and everybody is told about by somebody: a room that
   * talks can always solve it.
   */
  it('tells each phone about somebody else once the world is being difficult', () => {
    const state = room(4)
    const objective = make(state, 8)
    const told = Object.entries(objective.tells)

    expect(objective.headline).toBe('Tell them where they go!')
    for (const [playerId, about] of told) expect(about).not.toBe(playerId)
    expect(new Set(Object.values(objective.tells)).size).toBe(4)

    const brief = lineTo(objective, state, 'p1')
    const about = objective.tells.p1!
    expect(brief?.detail).toContain(state.players.get(about)!.name)
    expect(brief?.detail).toContain('tell them')
  })
})

describe('getting home', () => {
  it('is not done while somebody is on the wrong pad', () => {
    const state = room(3)
    const objective = make(state)
    goHome(state, objective, ['p1', 'p2'])

    findYourColour.step(objective, state, 10_000)

    expect(objective.outcome).toBe('running')
  })

  it('is done once everybody is home and has held it', () => {
    const state = room(3)
    const objective = make(state)
    goHome(state, objective, ['p1', 'p2', 'p3'])

    findYourColour.step(objective, state, objective.holdMs - 1)
    expect(objective.outcome).toBe('running')

    findYourColour.step(objective, state, 2)
    expect(objective.outcome).toBe('done')
  })

  it('gives a blob that turns up halfway through a pad of its own, and tells it', () => {
    const state = room(2)
    const objective = make(state)
    findYourColour.step(objective, state, 16)

    joinPlayer(state, 'p3', 'Ted')
    findYourColour.step(objective, state, 16)

    expect(objective.homes.p3).toBeDefined()
    // Nobody has heard anything about the newcomer, so it is told about itself
    // whatever the rest of the room was told.
    expect(objective.tells.p3).toBe('p3')
    expect(lineTo(objective, state, 'p3')?.detail).toContain('Yours is the')
  })

  /**
   * In the hard version your pad is written down on somebody else's phone. If
   * that somebody puts their phone down, the answer would be gone from the
   * room altogether — so the phone left in the dark is told about itself.
   */
  it('tells a phone about itself when the blob who knew its pad has gone', () => {
    const state = room(3)
    const objective = make(state, 8)
    const knower = Object.entries(objective.tells).find(([, about]) => about === 'p1')?.[0]
    expect(knower).toBeDefined()
    applyMessage(state, { type: 'left', playerId: 'p1' })

    findYourColour.step(objective, state, 16)

    expect(objective.tells[knower!]).toBe(knower)
    expect(lineTo(objective, state, knower!)?.detail).toContain('Yours is the')
  })

  it('forgets the pad of a blob whose phone has gone, and lets the rest finish', () => {
    const state = room(3)
    const objective = make(state)
    goHome(state, objective, ['p1', 'p2'])
    applyMessage(state, { type: 'left', playerId: 'p3' })

    findYourColour.step(objective, state, objective.holdMs + 1)

    expect(objective.homes.p3).toBeUndefined()
    expect(objective.outcome).toBe('done')
  })
})
