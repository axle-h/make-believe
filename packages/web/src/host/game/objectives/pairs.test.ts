import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { pairs, type PairsObjective } from './pairs.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `B${index}` })
  }
  return state
}

function make(state: GameState, level = 3, seed = 11): PairsObjective {
  return pairs.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
  })
}

/** Drive these blobs onto that pad; everybody else stays where they are. */
function stand(state: GameState, objective: PairsObjective, pad: number, ids: string[]): void {
  const zone = objective.zones[pad]!
  for (const id of ids) {
    const player = state.players.get(id)!
    player.x = zone.x
    player.y = zone.y
  }
}

function corner(state: GameState, ids: string[]): void {
  for (const id of ids) {
    const player = state.players.get(id)!
    player.x = 40
    player.y = 40
  }
}

describe('laying out the pads', () => {
  it('puts down one pad per couple, and never only one', () => {
    expect(make(room(3)).zones).toHaveLength(2)
    expect(make(room(4)).zones).toHaveLength(2)
    expect(make(room(6)).zones).toHaveLength(3)
  })

  it('squeezes the pads as the level goes up', () => {
    const easy = make(room(4), 1)
    const hard = make(room(4), 8)

    if (easy.zones[0]?.shape !== 'circle' || hard.zones[0]?.shape !== 'circle') {
      throw new Error('expected circles')
    }
    expect(hard.zones[0].radius).toBeLessThan(easy.zones[0].radius)
    expect(hard.totalMs).toBeLessThan(easy.totalMs)
  })
})

describe('pairing up', () => {
  it('is not done while somebody is standing on a pad by themselves', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2', 'p3'])
    stand(state, objective, 1, ['p4'])

    pairs.step(objective, state, 10_000)

    expect(objective.outcome).toBe('running')
    expect(objective.heldMs).toBe(0)
  })

  it('is not done while somebody is on no pad at all', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    corner(state, ['p3', 'p4'])

    pairs.step(objective, state, 10_000)

    expect(objective.outcome).toBe('running')
  })

  it('is done once everybody has somebody, and has held it', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    stand(state, objective, 1, ['p3', 'p4'])

    pairs.step(objective, state, objective.holdMs - 1)
    expect(objective.outcome).toBe('running')

    pairs.step(objective, state, 2)
    expect(objective.outcome).toBe('done')
  })

  /**
   * The rule is "nobody on their own", not "exactly two everywhere". A room of
   * three has to pile onto one pad, and a room that grows or shrinks mid-task
   * always has a sum that comes out — which is the whole reason for the rule.
   */
  it('lets three blobs share a pad rather than leaving one of them stranded', () => {
    const state = room(3)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2', 'p3'])

    pairs.step(objective, state, objective.holdMs + 1)

    expect(objective.outcome).toBe('done')
  })

  it('stops counting a blob whose phone has been put down', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    corner(state, ['p3', 'p4'])
    applyMessage(state, { type: 'left', playerId: 'p3' })
    applyMessage(state, { type: 'left', playerId: 'p4' })

    pairs.step(objective, state, objective.holdMs + 1)

    expect(objective.outcome).toBe('done')
  })

  it('drains the hold when a pair splits up, rather than throwing it away', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    stand(state, objective, 1, ['p3', 'p4'])
    pairs.step(objective, state, 1000)

    corner(state, ['p4'])
    pairs.step(objective, state, 200)

    expect(objective.heldMs).toBe(800)
  })
})

describe('what the phones are told', () => {
  it('is one line for everybody, counting who has found somebody', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    corner(state, ['p3', 'p4'])

    const briefs = pairs.briefs(objective, state)

    expect(briefs).toHaveLength(1)
    expect(briefs[0]?.to).toBe('*')
    expect(briefs[0]?.detail).toContain('2 of 4')
  })

  it('counts down the hold once they have sorted themselves out', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    stand(state, objective, 1, ['p3', 'p4'])

    expect(pairs.briefs(objective, state)[0]?.detail).toMatch(/^Hold it… \d$/)
  })
})
