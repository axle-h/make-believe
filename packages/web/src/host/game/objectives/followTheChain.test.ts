import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { MAX_LEVEL, PALETTE } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { followTheChain, type FollowTheChainObjective } from './followTheChain.js'
import { joinPlayer } from '../testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

function make(state: GameState, level = 3, seed = 31): FollowTheChainObjective {
  return followTheChain.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

/** Everybody drives onto whichever pad is lit. */
function ontoTheLight(state: GameState, objective: FollowTheChainObjective): void {
  const lit = objective.zones.find((zone) => zone.dim !== true)!
  for (const player of activePlayers(state)) {
    player.x = lit.x
    player.y = lit.y
  }
}

/** Solve one light: get there, and stand still long enough for it to count. */
function takeOne(state: GameState, objective: FollowTheChainObjective): void {
  ontoTheLight(state, objective)
  followTheChain.step(objective, state, objective.holdMs + 1)
}

describe('lighting the chain', () => {
  it('lights exactly one pad and leaves the rest dark', () => {
    const objective = make(room(2))

    expect(objective.zones.filter((zone) => zone.dim !== true)).toHaveLength(1)
    expect(objective.zones.length).toBeGreaterThan(1)
    expect(objective.position).toBe(0)
  })

  it('never lights the same pad twice running', () => {
    for (let seed = 0; seed < 40; seed++) {
      const objective = make(room(3), 6, seed)
      for (const [index, id] of objective.chain.entries()) {
        if (index > 0) expect(id).not.toBe(objective.chain[index - 1])
      }
    }
  })

  it('asks for a longer chain as the level goes up', () => {
    expect(make(room(2), 8).chain.length).toBeGreaterThan(make(room(2), 1).chain.length)
  })

  /**
   * Six lights was too many to hold in a head, and the room ran out of clock
   * long before the end of it. Four is the top of it now, at every level and
   * in every size of room.
   */
  it('never asks for more than four lights', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let players = 2; players <= PALETTE.length; players++) {
        for (let seed = 0; seed < 8; seed++) {
          expect(make(room(players), level, seed).chain.length).toBeLessThanOrEqual(4)
        }
      }
    }
  })

  /**
   * A longer chain must not also be a tighter one. It was the other way round:
   * the hardest version asked for twice the lights in three quarters of the
   * time, which is where a room of six got stuck.
   */
  it('gives the room time for each light rather than for the task', () => {
    const easy = make(room(4), 1)
    const hard = make(room(4), MAX_LEVEL)

    expect(easy.totalMs / easy.chain.length).toBeGreaterThan(hard.totalMs / hard.chain.length)
    expect(hard.totalMs / hard.chain.length).toBeGreaterThan(10_000)
  })

  /** Whatever else it gives up, it never comes down to one pad and no chain. */
  it('always has somewhere to send the room next', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let players = 2; players <= PALETTE.length; players++) {
        for (let seed = 0; seed < 8; seed++) {
          expect(make(room(players), level, seed).zones.length).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })
})

describe('following it', () => {
  it('moves the light along once everybody has stood on the lit one', () => {
    const state = room(3)
    const objective = make(state)
    const first = objective.chain[0]

    takeOne(state, objective)

    expect(objective.position).toBe(1)
    expect(objective.heldMs).toBe(0)
    const lit = objective.zones.find((zone) => zone.dim !== true)
    expect(lit?.id).toBe(objective.chain[1])
    expect(lit?.id).not.toBe(first)
  })

  it('waits for the last blob rather than the first', () => {
    const state = room(3)
    const objective = make(state)
    ontoTheLight(state, objective)
    const straggler = state.players.get('p3')!
    straggler.x = 40
    straggler.y = 40

    followTheChain.step(objective, state, 10_000)

    expect(objective.position).toBe(0)
  })

  it('is done at the end of the chain, and not before', () => {
    const state = room(2)
    const objective = make(state)
    for (let light = 1; light < objective.chain.length; light++) {
      takeOne(state, objective)
      expect(objective.outcome).toBe('running')
    }

    takeOne(state, objective)

    expect(objective.outcome).toBe('done')
  })

  it('is judged against whoever is here now, not whoever started', () => {
    const state = room(3)
    const objective = make(state)
    const gone = state.players.get('p3')!
    gone.x = 40
    gone.y = 40
    applyMessage(state, { type: 'left', playerId: 'p3' })

    takeOne(state, objective)

    expect(objective.position).toBe(1)
  })
})

describe('what the phones are told', () => {
  it('says how far along the chain the room has got, in the colour of the light', () => {
    const state = room(2)
    const objective = make(state)
    const lit = objective.zones.find((zone) => zone.dim !== true)!

    const [brief] = followTheChain.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.detail).toContain(`Light 1 of ${objective.chain.length}`)
    expect(brief?.colour).toBe(lit.colour)
  })

  it('counts down the pause once everybody is on it', () => {
    const state = room(2)
    const objective = make(state)
    ontoTheLight(state, objective)

    expect(followTheChain.briefs(objective, state)[0]?.detail).toMatch(/^Hold it… \d$/)
  })
})
