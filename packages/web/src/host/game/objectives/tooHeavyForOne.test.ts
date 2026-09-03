import { describe, expect, it } from 'vitest'
import { CRATE_SIZE, type Crate } from '../carryables.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { tooHeavyForOne, type TooHeavyObjective } from './tooHeavyForOne.js'
import { joinPlayer } from '../testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

function make(state: GameState, level = 7, seed = 81): TooHeavyObjective {
  return tooHeavyForOne.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

function crateOf(objective: TooHeavyObjective): Crate {
  const crate = objective.carryables[0]
  if (crate?.kind !== 'crate') throw new Error('expected a crate')
  return crate
}

/** Stand behind the crate, pushing the way the test says. */
function lean(state: GameState, playerId: string, crate: Crate, dx: number, dy: number): void {
  const player = state.players.get(playerId)!
  player.x = crate.x - dx * CRATE_SIZE * 0.7
  player.y = crate.y - dy * CRATE_SIZE * 0.7
  player.dx = dx
  player.dy = dy
}

describe('setting it up', () => {
  it('puts the crate a proper shove away from where it is wanted', () => {
    for (let seed = 0; seed < 20; seed++) {
      const objective = make(room(2), 7, seed)
      const crate = crateOf(objective)
      const spot = objective.zones[0]
      if (spot?.shape !== 'circle') throw new Error('expected a circle')

      // Plainly a shove away, rather than sitting in it already.
      expect(Math.hypot(crate.x - spot.x, crate.y - spot.y)).toBeGreaterThan(spot.radius * 2)
      expect(crate.home).toBeNull()
    }
  })
})

describe('shifting it', () => {
  /** The whole point: one child driving at it as hard as they like does nothing. */
  it('does not move for one blob', () => {
    const state = room(2)
    const objective = make(state)
    const crate = crateOf(objective)
    const was = { x: crate.x, y: crate.y }
    lean(state, 'p1', crate, 1, 0)

    for (let step = 0; step < 20; step++) tooHeavyForOne.step(objective, state, 100)

    expect(crate).toMatchObject(was)
    expect(objective.outcome).toBe('running')
  })

  it('moves for two, and says so on the strip', () => {
    const state = room(2)
    const objective = make(state)
    const crate = crateOf(objective)
    const was = crate.x
    lean(state, 'p1', crate, 1, 0)
    lean(state, 'p2', crate, 1, 0)

    tooHeavyForOne.step(objective, state, 200)

    expect(crate.x).toBeGreaterThan(was)
    expect(tooHeavyForOne.briefs(objective, state)[0]?.detail).toContain('Heave')
  })

  it('says how many are leaning on it while it is still stuck', () => {
    const state = room(2)
    const objective = make(state)
    lean(state, 'p1', crateOf(objective), 1, 0)
    tooHeavyForOne.step(objective, state, 100)

    expect(tooHeavyForOne.briefs(objective, state)[0]?.detail).toContain('1 of 2')
  })

  it('is done when the two of them get it onto the spot', () => {
    const state = room(2)
    const objective = make(state)
    const crate = crateOf(objective)
    const spot = objective.zones[0]!

    // Push it towards the spot, a step at a time, the way two children would.
    for (let step = 0; step < 400 && objective.outcome === 'running'; step++) {
      const dx = Math.sign(spot.x - crate.x)
      const dy = Math.sign(spot.y - crate.y)
      lean(state, 'p1', crate, dx, dy)
      lean(state, 'p2', crate, dx, dy)
      tooHeavyForOne.step(objective, state, 50)
    }

    expect(objective.outcome).toBe('done')
    expect(crate.home).toBe(spot.id)
    expect(objective.note).toContain('both of you')
  })
})
