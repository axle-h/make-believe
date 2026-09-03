import { ASKABLE_PAINTS } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { applyMessage, noteSkinColour } from '../apply.js'
import { toRgb } from '../colour.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { colourHunt, type ColourHuntObjective } from './colourHunt.js'

const PNG = 'data:image/png;base64,AAAA'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `B${index}` })
  }
  return state
}

function make(state: GameState, level = 5, seed = 41): ColourHuntObjective {
  return colourHunt.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
  })
}

/** Draw a blob all one colour, exactly as a phone and the renderer would. */
function paint(state: GameState, playerId: string, hex: string): void {
  applyMessage(state, { type: 'drawing', playerId, png: PNG })
  const skin = state.players.get(playerId)!.skin!
  noteSkinColour(state, playerId, skin.key, toRgb(hex))
}

function hexOf(name: string): string {
  return ASKABLE_PAINTS.find((crayon) => crayon.name === name)!.hex
}

describe('asking for a colour', () => {
  it('only ever asks for one a phone can actually paint with', () => {
    for (let seed = 0; seed < 30; seed++) {
      const objective = make(room(3), 5, seed)
      expect(ASKABLE_PAINTS.map((crayon) => crayon.name)).toContain(objective.paint)
      expect(objective.headline).toBe(`Everybody go ${objective.paint}!`)
    }
  })

  it('remembers what everybody had drawn before it started', () => {
    const state = room(2)
    paint(state, 'p1', '#ff5d5d')
    const objective = make(state)

    expect(objective.before).toEqual({ p1: 1, p2: 0 })
  })
})

describe('painting a blob', () => {
  it('is done once everybody has drawn themselves the right colour', () => {
    const state = room(2)
    const objective = make(state)
    paint(state, 'p1', hexOf(objective.paint))
    colourHunt.step(objective, state, 100)
    expect(objective.outcome).toBe('running')

    paint(state, 'p2', hexOf(objective.paint))
    colourHunt.step(objective, state, 100)

    expect(objective.outcome).toBe('done')
  })

  /** Roughly that colour is that colour. Nobody is being marked. */
  it('takes a scribbly approximation', () => {
    const state = room(2)
    const objective = make(state)
    const wanted = toRgb(hexOf(objective.paint))
    for (const id of ['p1', 'p2']) {
      applyMessage(state, { type: 'drawing', playerId: id, png: PNG })
      const skin = state.players.get(id)!.skin!
      noteSkinColour(state, id, skin.key, {
        r: Math.max(0, wanted.r - 30),
        g: Math.max(0, wanted.g - 20),
        b: Math.max(0, wanted.b - 25),
      })
    }

    colourHunt.step(objective, state, 100)

    expect(objective.outcome).toBe('done')
  })

  it('is not done by a blob that was already that colour and drew nothing', () => {
    const state = room(2)
    const wanted = ASKABLE_PAINTS[0]!
    paint(state, 'p1', wanted.hex)
    paint(state, 'p2', wanted.hex)
    const objective = make(state)
    objective.paint = wanted.name
    objective.paintHex = wanted.hex

    colourHunt.step(objective, state, 100)

    expect(objective.outcome).toBe('running')
  })

  it('does not count a drawing nobody has looked at yet', () => {
    const state = room(2)
    const objective = make(state)
    for (const id of ['p1', 'p2']) applyMessage(state, { type: 'drawing', playerId: id, png: PNG })

    colourHunt.step(objective, state, 100)

    expect(objective.outcome).toBe('running')
  })

  it('does not count a drawing that came out a different colour', () => {
    const state = room(2)
    const objective = make(state)
    const wrong = ASKABLE_PAINTS.find((crayon) => crayon.name !== objective.paint)!
    paint(state, 'p1', hexOf(objective.paint))
    paint(state, 'p2', wrong.hex)

    colourHunt.step(objective, state, 100)

    expect(objective.outcome).toBe('running')
  })
})

describe('coming and going', () => {
  it('asks a blob that turns up halfway through to draw as well', () => {
    const state = room(2)
    const objective = make(state)
    paint(state, 'p1', hexOf(objective.paint))
    paint(state, 'p2', hexOf(objective.paint))

    applyMessage(state, { type: 'join', playerId: 'p3', name: 'Ted' })
    colourHunt.step(objective, state, 100)
    expect(objective.outcome).toBe('running')

    paint(state, 'p3', hexOf(objective.paint))
    colourHunt.step(objective, state, 100)

    expect(objective.outcome).toBe('done')
  })

  it('lets the rest finish when somebody puts their phone down', () => {
    const state = room(3)
    const objective = make(state)
    paint(state, 'p1', hexOf(objective.paint))
    paint(state, 'p2', hexOf(objective.paint))
    applyMessage(state, { type: 'left', playerId: 'p3' })

    colourHunt.step(objective, state, 100)

    expect(objective.outcome).toBe('done')
  })
})

describe('what the phones are told', () => {
  it('says the colour, in the colour, and how many are done', () => {
    const state = room(3)
    const objective = make(state)
    paint(state, 'p1', hexOf(objective.paint))

    const [brief] = colourHunt.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.headline).toContain(objective.paint)
    expect(brief?.colour).toBe(objective.paintHex)
    expect(brief?.detail).toContain('1 of 3')
  })
})
