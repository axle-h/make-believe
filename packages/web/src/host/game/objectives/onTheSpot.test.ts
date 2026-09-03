import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { contains } from '../zones.js'
import { onTheSpot, type OnTheSpotObjective } from './onTheSpot.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `B${index}` })
  }
  return state
}

function make(state: GameState, level = 1, seed = 7): OnTheSpotObjective {
  return onTheSpot.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

/** Put these blobs on the spot; everybody else stays where they are. */
function stand(state: GameState, objective: OnTheSpotObjective, ids: string[]): void {
  const zone = objective.zones[0]!
  for (const id of ids) {
    const player = state.players.get(id)!
    player.x = zone.x
    player.y = zone.y
  }
}

/** Park these blobs in the far corner, where nothing is. */
function stepAway(state: GameState, ids: string[]): void {
  for (const id of ids) {
    const player = state.players.get(id)!
    player.x = 40
    player.y = 40
  }
}

describe('generating a spot', () => {
  it('makes a circle big enough for everybody at the easiest level', () => {
    const state = room(4)
    const objective = make(state)
    const zone = objective.zones[0]
    if (zone?.shape !== 'circle') throw new Error('expected a circle')

    stand(state, objective, ['p1', 'p2', 'p3', 'p4'])
    expect(zone.radius).toBeGreaterThan(100)
    expect(objective.headline).toBe('Everybody on the spot!')
  })

  it('makes a bigger circle for a bigger room', () => {
    const two = make(room(2))
    const six = make(room(6))
    if (two.zones[0]?.shape !== 'circle' || six.zones[0]?.shape !== 'circle') {
      throw new Error('expected circles')
    }

    expect(six.zones[0].radius).toBeGreaterThan(two.zones[0].radius)
  })

  it('starts running with nothing held and its whole clock left', () => {
    const objective = make(room(2))

    expect(objective.outcome).toBe('running')
    expect(objective.heldMs).toBe(0)
    expect(objective.note).toBeNull()
    expect(objective.remainingMs).toBe(objective.totalMs)
  })
})

describe('standing on it', () => {
  it('is not done until everybody is on it', () => {
    const state = room(3)
    const objective = make(state)
    stand(state, objective, ['p1', 'p2'])
    stepAway(state, ['p3'])

    onTheSpot.step(objective, state, 10_000)

    expect(objective.outcome).toBe('running')
    expect(objective.heldMs).toBe(0)
  })

  it('is done once they have all held it long enough', () => {
    const state = room(3)
    const objective = make(state)
    stand(state, objective, ['p1', 'p2', 'p3'])

    onTheSpot.step(objective, state, objective.holdMs - 1)
    expect(objective.outcome).toBe('running')

    onTheSpot.step(objective, state, 2)
    expect(objective.outcome).toBe('done')
  })

  /**
   * Being shoved off the spot must not cost the whole hold. Blobs shove each
   * other constantly — that is most of the fun — and a task that punished it
   * would make the shoving the enemy of the game rather than part of it.
   */
  it('drains the hold when somebody steps off, rather than throwing it away', () => {
    const state = room(2)
    const objective = make(state)
    stand(state, objective, ['p1', 'p2'])
    onTheSpot.step(objective, state, 1000)
    expect(objective.heldMs).toBe(1000)

    stepAway(state, ['p2'])
    onTheSpot.step(objective, state, 200)

    expect(objective.heldMs).toBe(800)
    expect(objective.outcome).toBe('running')
  })

  it('never drains below nothing', () => {
    const state = room(2)
    const objective = make(state)
    stepAway(state, ['p1', 'p2'])
    onTheSpot.step(objective, state, 60_000)

    expect(objective.heldMs).toBe(0)
  })

  /**
   * Away blobs are not there. A child who has put the phone down must not be
   * the reason the rest cannot finish.
   */
  it('takes no notice of a blob whose phone has gone', () => {
    const state = room(3)
    const objective = make(state)
    stand(state, objective, ['p1', 'p2'])
    stepAway(state, ['p3'])
    applyMessage(state, { type: 'left', playerId: 'p3' })

    onTheSpot.step(objective, state, objective.holdMs + 1)

    expect(objective.outcome).toBe('done')
  })

  it('does nothing at all in an empty room', () => {
    const state = createGame(1)
    const objective = onTheSpot.generate({
      id: 'obj-1',
      world: state.world,
      rng: createRng(2),
      level: 1,
      players: [],
      crown: null,
    })

    onTheSpot.step(objective, state, 60_000)

    expect(objective.outcome).toBe('running')
  })
})

describe('what it tells the phones', () => {
  it('counts who is on it while they are still getting there', () => {
    const state = room(3)
    const objective = make(state)
    stand(state, objective, ['p1'])
    stepAway(state, ['p2', 'p3'])

    expect(onTheSpot.briefs(objective, state)).toEqual([
      {
        to: '*',
        headline: 'Everybody on the spot!',
        detail: '1 of 3 on the spot',
        colour: objective.zones[0]?.colour,
        tone: 'task',
      },
    ])
  })

  it('counts the hold down in whole seconds once they are all on', () => {
    const state = room(2)
    const objective = make(state)
    stand(state, objective, ['p1', 'p2'])

    expect(onTheSpot.briefs(objective, state)[0]?.detail).toMatch(/^Hold it… \d$/)
  })

  /** Everybody gets the same line: nothing about this task is private. */
  it('says one thing, to everybody', () => {
    const state = room(4)
    const objective = make(state)

    expect(onTheSpot.briefs(objective, state).map((brief) => brief.to)).toEqual(['*'])
  })
})

describe('the shape of the task', () => {
  it('wants two blobs before it means anything', () => {
    expect(onTheSpot.minPlayers).toBe(2)
    expect(onTheSpot.minLevel).toBe(1)
  })

  /** It watches the floor and nothing else — no talking, no drawing. */
  it('listens to nothing a phone sends', () => {
    expect(onTheSpot.observe).toBeUndefined()
  })

  it('puts the spot where a blob standing dead on its centre is on it', () => {
    const state = room(2)
    const objective = make(state)
    const zone = objective.zones[0]!

    expect(contains(zone, zone.x, zone.y)).toBe(true)
  })
})
