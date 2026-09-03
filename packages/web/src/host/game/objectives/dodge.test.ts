import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, MAX_LEVEL, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { catches, stepHazards, type Hazard } from '../hazards.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { tick } from '../tick.js'
import { dodge, type DodgeObjective } from './dodge.js'

/**
 * Nobody is ever eliminated. Losing the last life makes a blob fuzzy — still
 * driving, no longer hittable — which is the same shape as being shoved off
 * the sumo island: a state you drive around in, not one you are let out of.
 */

function room(count: number): GameState {
  const state = createGame(4)
  for (let index = 1; index <= count; index++) joinPlayer(state, `p${index}`, `B${index}`)
  return state
}

function make(state: GameState, level = 5, seed = 8): DodgeObjective {
  const objective = dodge.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
  state.objectives.current = objective
  return objective
}

/** Drop something right on top of a blob. */
function splat(state: GameState, objective: DodgeObjective, playerId: string): void {
  const player = state.players.get(playerId)!
  objective.hazards = [
    { id: `splat-${playerId}`, x: player.x, y: player.y, vx: 0, vy: 0, size: 44, glyph: '🍅' },
  ]
}

describe('things drifting across the floor', () => {
  it('move where they are going, and are forgotten once they are gone', () => {
    const world = { width: WORLD_WIDTH, height: WORLD_HEIGHT }
    const flying: Hazard[] = [
      { id: 'a', x: 100, y: 100, vx: 200, vy: 0, size: 44, glyph: '🍅' },
      { id: 'b', x: WORLD_WIDTH - 20, y: 300, vx: 400, vy: 0, size: 44, glyph: '🍅' },
    ]

    const left = stepHazards(flying, world, 1_000)

    expect(left.map((hazard) => hazard.id)).toEqual(['a'])
    expect(left[0]?.x).toBe(300)
  })

  it('catches a blob it lands on, and misses one it does not', () => {
    const state = room(2)
    const player = state.players.get('p1')!
    player.x = 400
    player.y = 400
    const hazard: Hazard = { id: 'a', x: 400, y: 400, vx: 0, vy: 0, size: 44, glyph: '🍅' }

    expect(catches(hazard, player)).toBe(true)
    expect(catches({ ...hazard, x: 400 + BLOB_SIZE * 2 }, player)).toBe(false)
  })

  it('sends something over every so often, faster and oftener as the level goes up', () => {
    const state = room(3)
    const easy = make(state, 1)
    const hard = make(room(3), MAX_LEVEL)

    expect(hard.everyMs).toBeLessThan(easy.everyMs)
    expect(hard.speed).toBeGreaterThan(easy.speed)

    dodge.step(easy, state, easy.everyMs + 1)
    expect(easy.hazards).toHaveLength(1)
  })
})

describe('being hit', () => {
  it('costs exactly one life, however long it sits on you', () => {
    const state = room(2)
    const objective = make(state)
    splat(state, objective, 'p1')

    for (let frame = 0; frame < 10; frame++) dodge.step(objective, state, 16)

    expect(objective.lives['p1']).toBe(2)
    expect(objective.lives['p2']).toBe(3)
  })

  it('blips the phone it happened to, and nobody else', () => {
    const state = room(2)
    const objective = make(state)
    state.objectives.sounds = []
    splat(state, objective, 'p2')

    dodge.step(objective, state, 16)

    expect(state.objectives.sounds).toEqual([{ to: 'p2', cue: 'hit' }])
  })

  it('wears what is left beside the name', () => {
    const state = room(2)
    const objective = make(state)

    expect(objective.marks.find((mark) => mark.playerId === 'p1')?.badge).toBe('♥♥♥')

    splat(state, objective, 'p1')
    dodge.step(objective, state, 16)

    expect(objective.marks.find((mark) => mark.playerId === 'p1')?.badge).toBe('♥♥')
  })
})

describe('running out of them', () => {
  /** Three hits, each after the moment of safety the last one bought. */
  function splatThrice(state: GameState, objective: DodgeObjective, playerId: string): void {
    for (let go = 0; go < 3; go++) {
      splat(state, objective, playerId)
      dodge.step(objective, state, 16)
      objective.hazards = []
      dodge.step(objective, state, 2_000)
    }
  }

  it('makes a blob fuzzy rather than taking it away', () => {
    const state = room(2)
    const objective = make(state)

    splatThrice(state, objective, 'p1')

    expect(objective.lives['p1']).toBe(0)
    expect(objective.fuzzy).toEqual(['p1'])
    expect(state.players.has('p1')).toBe(true)
  })

  it('leaves a fuzzy blob driving exactly as it was', () => {
    const state = room(2)
    const objective = make(state)
    splatThrice(state, objective, 'p1')
    const blob = state.players.get('p1')!
    const was = blob.y
    blob.dx = 0
    blob.dy = was < WORLD_HEIGHT / 2 ? 1 : -1

    tick(state, 200)

    expect(Math.abs(state.players.get('p1')!.y - was)).toBeGreaterThan(20)
  })

  it('stops a fuzzy blob being hit again', () => {
    const state = room(2)
    const objective = make(state)
    splatThrice(state, objective, 'p1')
    state.objectives.sounds = []

    splat(state, objective, 'p1')
    dodge.step(objective, state, 16)

    expect(objective.lives['p1']).toBe(0)
    expect(state.objectives.sounds).toEqual([])
  })

  /** Anybody still standing wins it for the room. */
  it('is won at the buzzer while anybody is still solid', () => {
    const state = room(2)
    const objective = make(state)
    splatThrice(state, objective, 'p1')
    objective.remainingMs = 0

    dodge.step(objective, state, 16)

    expect(objective.outcome).toBe('done')
    expect(objective.note).toContain('1 of you')
  })

  it('ends cheerfully once nobody is left solid, rather than running on', () => {
    const state = room(2)
    const objective = make(state)
    splatThrice(state, objective, 'p1')
    splatThrice(state, objective, 'p2')

    expect(objective.outcome).toBe('expired')
    expect(objective.note).toBe('Everybody got splatted!')
  })

  /** Lives belong to the task, so the next one starts everybody at three. */
  it('leaves nothing behind on the blobs themselves', () => {
    const state = room(2)
    const objective = make(state)
    splatThrice(state, objective, 'p1')

    const next = make(state, 5, 12)

    expect(next.lives['p1']).toBe(3)
    expect(next.fuzzy).toEqual([])
  })

  it('gives a blob that turns up halfway through its three as well', () => {
    const state = room(2)
    const objective = make(state)
    joinPlayer(state, 'p3', 'Ted')

    dodge.step(objective, state, 16)

    expect(objective.lives['p3']).toBe(3)
  })
})

describe('what the phones are told', () => {
  it('counts who is still going', () => {
    const state = room(3)
    const objective = make(state)

    const [brief] = dodge.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.headline).toContain('Dodge the')
    expect(brief?.detail).toContain('3 of 3 still going')
  })
})
