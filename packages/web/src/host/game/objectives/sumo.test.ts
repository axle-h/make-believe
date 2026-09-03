import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { BLOB_SIZE } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { contains, type CircleZone } from '../zones.js'
import { sumo, type SumoObjective } from './sumo.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `B${index}` })
  }
  return state
}

function make(state: GameState, level = 5, seed = 7): SumoObjective {
  return sumo.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
  })
}

function island(objective: SumoObjective): CircleZone {
  const zone = objective.zones[0]
  if (!zone || zone.shape !== 'circle') throw new Error('sumo draws one circle')
  return zone
}

/** Put a blob exactly where the test wants it, standing still. */
function stand(state: GameState, id: string, x: number, y: number): void {
  const player = state.players.get(id)
  if (!player) throw new Error(`no blob ${id}`)
  player.x = x
  player.y = y
  player.dx = 0
  player.dy = 0
}

/** Wind the clock on the way the director does: the timer, then the step. */
function play(state: GameState, objective: SumoObjective, ms: number): void {
  const step = 50
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    objective.remainingMs = Math.max(0, objective.remainingMs - step)
    sumo.step(objective, state, step)
  }
}

describe('sumo: generating', () => {
  it('puts one island in the middle of the floor, and nothing else', () => {
    const state = room(3)
    const objective = make(state)
    const ring = island(objective)

    expect(ring.x).toBe(state.world.width / 2)
    expect(ring.y).toBe(state.world.height / 2)
    expect(objective.carryables).toEqual([])
    expect(objective.marks).toEqual([])
    expect(objective.outcome).toBe('running')
  })

  /**
   * Against a wall, a blob shoved off has nowhere to go and the wall holds it
   * on, which quietly undoes the one rule of the task.
   */
  it('leaves floor all the way round it, to be shoved off onto', () => {
    for (let level = 1; level <= 8; level++) {
      const ring = island(make(room(4), level, level))

      expect(ring.x - ring.radius).toBeGreaterThan(0)
      expect(ring.y - ring.radius).toBeGreaterThan(0)
      expect(ring.radius).toBeGreaterThan(BLOB_SIZE)
    }
  })

  it('is the same island twice from the same seed, and a different one from another', () => {
    const state = room(3)
    expect(make(state, 5, 7)).toEqual(make(state, 5, 7))
    expect(make(state, 5, 7).startRadius).not.toBe(make(state, 5, 99).startRadius)
  })

  it('starts smaller, ends smaller and shoves harder the higher the level', () => {
    const state = room(3)
    const easy = make(state, 1)
    const hard = make(state, 8)

    expect(hard.startRadius).toBeLessThan(easy.startRadius)
    expect(hard.endRadius).toBeLessThan(easy.endRadius)
    expect(hard.shove).toBeGreaterThan(easy.shove)
    expect(hard.totalMs).toBeLessThan(easy.totalMs)
  })

  it('always ends up smaller than it started', () => {
    for (let level = 1; level <= 8; level++) {
      const objective = make(room(6), level, level * 3)
      expect(objective.endRadius).toBeLessThan(objective.startRadius)
    }
  })

  it('needs two blobs, and waits until a room can drive before asking', () => {
    expect(sumo.minPlayers).toBe(2)
    expect(sumo.minLevel).toBeGreaterThan(1)
  })
})

describe('sumo: the island', () => {
  it('shrinks as the clock runs down, and is at its smallest at the buzzer', () => {
    const state = room(3)
    const objective = make(state)
    const started = island(objective).radius

    play(state, objective, objective.totalMs / 2)
    const halfway = island(objective).radius

    expect(halfway).toBeLessThan(started)
    expect(halfway).toBeGreaterThan(objective.endRadius)

    play(state, objective, objective.totalMs)
    expect(island(objective).radius).toBeCloseTo(objective.endRadius, 5)
  })

  /** A blob standing still near the edge is left off it, rather than dragged in. */
  it('shrinks out from under whoever was standing at the edge', () => {
    const state = room(2)
    const objective = make(state)
    const ring = island(objective)
    const edge = { x: ring.x + ring.radius - 5, y: ring.y }
    stand(state, 'p1', edge.x, edge.y)
    stand(state, 'p2', ring.x, ring.y)
    expect(contains(island(objective), edge.x, edge.y)).toBe(true)

    play(state, objective, objective.totalMs / 2)

    expect(contains(island(objective), edge.x, edge.y)).toBe(false)
    expect(contains(island(objective), ring.x, ring.y)).toBe(true)
  })
})

describe('sumo: shoving', () => {
  it('lets a blob driving into another push it off the island', () => {
    const state = room(2)
    const objective = make(state)
    const ring = island(objective)
    // One standing on the very edge, and one right behind it driving outwards.
    const edge = { x: ring.x + ring.radius - 4, y: ring.y }
    stand(state, 'p2', edge.x, edge.y)
    stand(state, 'p1', edge.x - BLOB_SIZE, edge.y)
    applyMessage(state, { type: 'input', playerId: 'p1', dx: 1, dy: 0 })
    expect(contains(ring, edge.x, edge.y)).toBe(true)

    for (let frame = 0; frame < 10; frame++) sumo.step(objective, state, 50)

    const p2 = state.players.get('p2')
    expect(p2?.x ?? 0).toBeGreaterThan(edge.x)
    expect(contains(island(objective), p2?.x ?? 0, p2?.y ?? 0)).toBe(false)
  })

  it('leaves everybody where they are while nobody is driving at anybody', () => {
    const state = room(3)
    const objective = make(state)
    const before = activePlayers(state).map((player) => ({
      playerId: player.playerId,
      x: player.x,
      y: player.y,
    }))

    for (let frame = 0; frame < 20; frame++) sumo.step(objective, state, 50)

    for (const player of before) {
      expect(state.players.get(player.playerId)?.x).toBe(player.x)
      expect(state.players.get(player.playerId)?.y).toBe(player.y)
    }
  })
})

describe('sumo: ending', () => {
  it('runs until the buzzer, however many are left standing on it', () => {
    const state = room(3)
    const objective = make(state)
    const ring = island(objective)
    stand(state, 'p1', ring.x, ring.y)
    stand(state, 'p2', 40, 40)
    stand(state, 'p3', 40, 40)

    play(state, objective, objective.totalMs - 1_000)
    expect(objective.outcome).toBe('running')

    play(state, objective, 1_100)
    expect(objective.outcome).toBe('done')
  })

  /** Being shoved off is the joke, not a loss: the room still scores. */
  it('names whoever is left standing at the buzzer', () => {
    const state = room(2)
    const objective = make(state)
    const ring = island(objective)
    stand(state, 'p1', ring.x, ring.y)
    stand(state, 'p2', 40, 40)

    play(state, objective, objective.totalMs + 100)

    expect(objective.outcome).toBe('done')
    expect(objective.note).toContain('B1')
  })

  it('is cheerful even when the last of them slid off', () => {
    const state = room(2)
    const objective = make(state)
    stand(state, 'p1', 40, 40)
    stand(state, 'p2', state.world.width - 40, 40)

    play(state, objective, objective.totalMs + 100)

    expect(objective.outcome).toBe('done')
    expect(objective.note).toBeTruthy()
    expect(objective.note).not.toContain('Blob')
  })

  /**
   * Judged against whoever is present now: a phone put down halfway through
   * does not win by having been parked in the middle.
   */
  it('does not count a blob whose phone has gone', () => {
    const state = room(2)
    const objective = make(state)
    const ring = island(objective)
    stand(state, 'p1', ring.x, ring.y)
    stand(state, 'p2', ring.x + 10, ring.y)
    applyMessage(state, { type: 'left', playerId: 'p1' })

    play(state, objective, objective.totalMs + 100)

    expect(objective.note).toContain('B2')
    expect(objective.note).not.toContain('B1')
  })
})

describe('sumo: what the phones are told', () => {
  it('counts who is still on it, in the colour of the island', () => {
    const state = room(3)
    const objective = make(state)
    const ring = island(objective)
    stand(state, 'p1', ring.x, ring.y)
    stand(state, 'p2', ring.x + 10, ring.y)
    stand(state, 'p3', 40, 40)

    const briefs = sumo.briefs(objective, state)

    expect(briefs).toHaveLength(1)
    expect(briefs[0]?.to).toBe('*')
    expect(briefs[0]?.detail).toContain('2 of 3')
    expect(briefs[0]?.colour).toBe(ring.colour)
  })
})
