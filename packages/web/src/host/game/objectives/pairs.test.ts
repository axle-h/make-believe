import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { MAX_LEVEL } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { pairs, type PairsObjective } from './pairs.js'
import { eligibleTemplates } from './registry.js'
import { joinPlayer } from '../testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
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
    crown: null,
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

/** What the world could ask a room this size for, at the top of the ladder. */
function kinds(present: number): string[] {
  return eligibleTemplates(MAX_LEVEL, present).map((template) => template.kind)
}

function corner(state: GameState, ids: string[]): void {
  for (const id of ids) {
    const player = state.players.get(id)!
    player.x = 40
    player.y = 40
  }
}

describe('laying out the pads', () => {
  it('puts down one pad per couple, however big the room is', () => {
    expect(make(room(4)).zones).toHaveLength(2)
    expect(make(room(6)).zones).toHaveLength(3)
    // No cap: ten blobs get five pads, because four pads and ten blobs in
    // twos is a sum that does not come out.
    expect(make(room(10)).zones).toHaveLength(5)
  })

  it('starts every pad dim, so a lit one means it has its two', () => {
    expect(make(room(4)).zones.every((zone) => zone.dim === true)).toBe(true)
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

  /**
   * The rule a child would guess from the name, and the one the pads are sized
   * for: three on a pad is a crowd, not a couple.
   */
  it('does not count three on a pad, however keen they are', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2', 'p3'])
    stand(state, objective, 1, ['p4'])

    pairs.step(objective, state, 10_000)

    expect(objective.outcome).toBe('running')
    expect(pairs.briefs(objective, state)[0]?.detail).toContain('0 of 4')
  })

  it('is not done with the whole room piled onto one pad', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2', 'p3', 'p4'])

    pairs.step(objective, state, 10_000)

    expect(objective.outcome).toBe('running')

    // And splitting into the two pads is what finishes it.
    stand(state, objective, 1, ['p3', 'p4'])
    pairs.step(objective, state, objective.holdMs + 1)
    expect(objective.outcome).toBe('done')
  })

  it('lights a pad once it has its two, and dims it again when they split', () => {
    const state = room(4)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    corner(state, ['p3', 'p4'])

    pairs.step(objective, state, 16)
    expect(objective.zones[0]?.dim).toBe(false)
    expect(objective.zones[1]?.dim).toBe(true)

    corner(state, ['p2'])
    pairs.step(objective, state, 16)
    expect(objective.zones[0]?.dim).toBe(true)
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
   * It is judged against whoever is here now. A couple who put their phones
   * down leave a pad spare, and a spare pad must not be a task the four who
   * are left cannot finish.
   */
  it('stops counting a blob whose phone has been put down, spare pad and all', () => {
    const state = room(6)
    const objective = make(state)
    stand(state, objective, 0, ['p1', 'p2'])
    stand(state, objective, 1, ['p3', 'p4'])
    corner(state, ['p5', 'p6'])
    applyMessage(state, { type: 'left', playerId: 'p5' })
    applyMessage(state, { type: 'left', playerId: 'p6' })

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

describe('which rooms it suits', () => {
  it('is only ever asked for when the room can be halved', () => {
    for (const even of [4, 6, 8, 10]) expect(pairs.suits?.(even)).toBe(true)
    for (const odd of [3, 5, 7, 9]) expect(pairs.suits?.(odd)).toBe(false)
  })

  it('wants four, because two blobs and one pad is not a negotiation', () => {
    expect(pairs.minPlayers).toBe(4)
  })

  it('is offered to an even room and withheld from an odd one', () => {
    expect(kinds(4)).toContain('pairs')
    expect(kinds(10)).toContain('pairs')
    expect(kinds(5)).not.toContain('pairs')
    expect(kinds(3)).not.toContain('pairs')
    expect(kinds(2)).not.toContain('pairs')
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
