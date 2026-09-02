import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { INTERLUDE_MS, LEVEL_UP_AFTER, SCORE_PER_OBJECTIVE } from '../constants.js'
import { activePlayers, objectives } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { tick } from '../tick.js'
import { contains } from '../zones.js'
import { banner, briefFor, stepObjectives } from './director.js'
import type { Objective } from './types.js'

/**
 * The director is the thing that must never turn the game into rounds, so
 * these tests are as much about what it does *not* do — make anybody wait,
 * take anything away, punish anyone — as about what it does.
 */

function room(names: string[], seed = 1): GameState {
  const state = createGame(seed)
  for (const [index, name] of names.entries()) {
    applyMessage(state, { type: 'join', playerId: `p${index + 1}`, name })
  }
  return state
}

/** Make an objective appear, and hand it over. */
function started(state: GameState): Objective {
  stepObjectives(state, 16)
  const objective = state.objectives.current
  if (!objective) throw new Error('expected an objective')
  return objective
}

/**
 * Start the task this test is about. The director never asks for the same
 * thing twice running while there is anything else it could ask for, so saying
 * what was just played is how a test says what it wants next. The guard is
 * there for the day a third template makes that no longer enough.
 */
function startedOnTheSpot(state: GameState): Objective {
  state.objectives.lastKind = 'hotPotato'
  const objective = started(state)
  expect(objective.kind).toBe('onTheSpot')
  return objective
}

/** Watch a few tasks go by, however each of them ends, and say what they were. */
function kindsOverTime(state: GameState, count: number): Objective['kind'][] {
  const kinds: Objective['kind'][] = []
  while (kinds.length < count) {
    kinds.push(started(state).kind)
    runUntilFinished(state, 1_000)
    stepObjectives(state, INTERLUDE_MS + 1)
  }
  return kinds
}

/** Stand everybody on the first zone, exactly as driving there would. */
function standOnIt(state: GameState, objective: Objective): void {
  const zone = objective.zones[0]
  if (!zone) throw new Error('expected a zone')
  for (const player of activePlayers(state)) {
    player.x = zone.x
    player.y = zone.y
  }
}

/** Run the objective until it is over, or give up after a simulated minute. */
function runUntilFinished(state: GameState, stepMs = 100): void {
  for (let elapsed = 0; elapsed < 120_000; elapsed += stepMs) {
    stepObjectives(state, stepMs)
    const objective = state.objectives.current
    if (!objective || objective.outcome !== 'running') return
  }
  throw new Error('the objective never finished')
}

describe('choosing something to do', () => {
  it('asks for nothing at all until there are enough blobs for it to mean something', () => {
    const state = room(['Wilf'])
    stepObjectives(state, 16)

    expect(state.objectives.current).toBeNull()
  })

  it('makes one the moment a second blob arrives, with nobody pressing anything', () => {
    const state = room(['Wilf'])
    stepObjectives(state, 16)
    applyMessage(state, { type: 'join', playerId: 'p2', name: 'Ida' })
    stepObjectives(state, 16)

    expect(state.objectives.current?.kind).toBe('onTheSpot')
  })

  it('puts the spot inside the world, where a blob can actually stand on it', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = room(['Wilf', 'Ida', 'Ted'], seed)
      const objective = started(state)
      const zone = objective.zones[0]
      if (!zone || zone.shape !== 'circle') throw new Error('expected a circle')

      expect(zone.x - zone.radius).toBeGreaterThan(0)
      expect(zone.x + zone.radius).toBeLessThan(state.world.width)
      expect(zone.y - zone.radius).toBeGreaterThan(0)
      expect(zone.y + zone.radius).toBeLessThan(state.world.height)
    }
  })

  it('generates the same world twice from the same seed', () => {
    const first = started(room(['Wilf', 'Ida'], 4242))
    const second = started(room(['Wilf', 'Ida'], 4242))

    expect(second.zones).toEqual(first.zones)
    expect(second.totalMs).toBe(first.totalMs)
  })
})

describe('finishing one', () => {
  it('raises the score when the room does it', () => {
    const state = room(['Wilf', 'Ida'])
    const objective = started(state)
    standOnIt(state, objective)
    runUntilFinished(state)

    expect(objective.outcome).toBe('done')
    expect(state.objectives.score).toBe(SCORE_PER_OBJECTIVE)
  })

  it('says something cheerful and then makes another, on its own', () => {
    const state = room(['Wilf', 'Ida'])
    const first = started(state)
    standOnIt(state, first)
    runUntilFinished(state)

    expect(first.note).toBeTruthy()
    expect(banner(state)?.tone).toBe('win')

    // The finished one stays up a moment, then the next appears with nobody
    // touching a thing.
    stepObjectives(state, INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.current).not.toBeNull()
    expect(state.objectives.current).not.toBe(first)
    expect(state.objectives.current?.outcome).toBe('running')
  })

  it('raises the level after three of them, and not before', () => {
    const state = room(['Wilf', 'Ida'])
    for (let round = 1; round <= LEVEL_UP_AFTER; round++) {
      const objective = started(state)
      standOnIt(state, objective)
      runUntilFinished(state)
      expect(state.objectives.level).toBe(round < LEVEL_UP_AFTER ? 1 : 2)
      stepObjectives(state, INTERLUDE_MS + 1)
    }

    expect(state.objectives.score).toBe(SCORE_PER_OBJECTIVE * LEVEL_UP_AFTER)
    expect(state.objectives.streak).toBe(0)
  })

  it('asks for a smaller spot as the level goes up', () => {
    const easy = startedOnTheSpot(room(['Wilf', 'Ida', 'Ted'], 9))
    const state = room(['Wilf', 'Ida', 'Ted'], 9)
    state.objectives.level = 6
    const hard = startedOnTheSpot(state)

    const before = easy.zones[0]
    const after = hard.zones[0]
    if (before?.shape !== 'circle' || after?.shape !== 'circle') throw new Error('expected circles')
    expect(after.radius).toBeLessThan(before.radius)
    expect(hard.totalMs).toBeLessThan(easy.totalMs)
  })
})

describe('running out of time', () => {
  /** The youngest player is three. Nothing is ever taken away from anybody. */
  it('ends without taking anything away', () => {
    const state = room(['Wilf', 'Ida'])
    state.objectives.score = 30
    state.objectives.streak = 2
    state.objectives.level = 3
    const objective = startedOnTheSpot(state)
    runUntilFinished(state, 1000)

    expect(objective.outcome).toBe('expired')
    expect(state.objectives.score).toBe(30)
    expect(state.objectives.streak).toBe(2)
    expect(state.objectives.level).toBe(3)
    expect(banner(state)?.tone).toBe('miss')
  })

  it('says something kind about it', () => {
    const state = room(['Wilf', 'Ida'])
    const objective = startedOnTheSpot(state)
    runUntilFinished(state, 1000)

    expect(objective.note).toBeTruthy()
  })
})

/**
 * More than one thing to do. The level decides what the room is allowed to be
 * asked for, and the director decides which of those it actually asks — never
 * the same thing twice running while there is anything else going.
 */
describe('a ladder of tasks', () => {
  it('keeps the harder task off the floor until the room has levelled up', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 3)

    expect(new Set(kindsOverTime(state, 6))).toEqual(new Set(['onTheSpot']))
  })

  it('asks for something else once the room has levelled up', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 3)
    state.objectives.level = 2

    expect(new Set(kindsOverTime(state, 6))).toEqual(new Set(['onTheSpot', 'hotPotato']))
  })

  it('never asks for the same thing twice running', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 5)
    state.objectives.level = 4
    const kinds = kindsOverTime(state, 8)

    for (const [index, kind] of kinds.entries()) {
      if (index > 0) expect(kind).not.toBe(kinds[index - 1])
    }
  })

  /** With nothing else eligible, repeating is not a fault — it is all there is. */
  it('repeats itself only when there is nothing else it could ask for', () => {
    const state = room(['Wilf', 'Ida'], 5)

    expect(kindsOverTime(state, 3)).toEqual(['onTheSpot', 'onTheSpot', 'onTheSpot'])
  })

  /**
   * "Brilliant!" is what the world says when a task has nothing of its own to
   * say. Who was left holding the potato is better, so the task's own words win.
   */
  it('lets a task say for itself how it ended', () => {
    const state = room(['Wilf', 'Ida'], 5)
    state.objectives.level = 2
    state.objectives.lastKind = 'onTheSpot'
    const objective = started(state)
    expect(objective.kind).toBe('hotPotato')

    runUntilFinished(state, 1_000)

    expect(objective.note).toContain('holding it')
    expect(banner(state)?.tone).toBe('win')
    expect(state.objectives.score).toBe(SCORE_PER_OBJECTIVE)
  })

  /** The potato has to reach the screen, and it rides on the blob wearing it. */
  it('puts what the task has pinned to a blob into the snapshot', () => {
    const state = room(['Wilf', 'Ida'], 5)
    state.objectives.level = 2
    state.objectives.lastKind = 'onTheSpot'
    const objective = started(state)

    const shown = objectives(state).objective
    expect(shown?.marks).toEqual(objective.marks)
    expect(shown?.marks[0]?.playerId).toBe((objective as { it?: string }).it)
  })
})

describe('coming and going', () => {
  /**
   * Children wander off and phones lock. The task is judged against whoever is
   * present right now, so the ones still playing can always finish it.
   */
  it('lets the blobs still here finish it after somebody puts their phone down', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    const objective = started(state)
    applyMessage(state, { type: 'left', playerId: 'p3' })
    standOnIt(state, objective)
    runUntilFinished(state)

    expect(objective.outcome).toBe('done')
    expect(state.objectives.score).toBe(SCORE_PER_OBJECTIVE)
  })

  it('counts a blob that joins halfway through, and tells it what is going on', () => {
    const state = room(['Wilf', 'Ida'])
    const objective = started(state)
    standOnIt(state, objective)
    stepObjectives(state, 100)

    applyMessage(state, { type: 'join', playerId: 'p3', name: 'Ted' })
    const brief = briefFor(state, 'p3')

    expect(brief?.headline).toBe(objective.headline)
    expect(brief?.detail).toBe('2 of 3 on the spot')

    // And the new blob is genuinely part of it: it is not done until they are on it too.
    stepObjectives(state, 5_000)
    expect(objective.outcome).toBe('running')
    standOnIt(state, objective)
    runUntilFinished(state)
    expect(objective.outcome).toBe('done')
  })

  it('abandons quietly when the room drops below what the task needs', () => {
    const state = room(['Wilf', 'Ida'])
    started(state)
    applyMessage(state, { type: 'left', playerId: 'p2' })
    stepObjectives(state, 16)

    expect(state.objectives.current).toBeNull()
    // No failure, no lost score, and a line explaining the quiet.
    expect(state.objectives.score).toBe(0)
    expect(banner(state)?.headline).toBe('Waiting for another blob…')
    expect(banner(state)?.tone).toBe('task')
  })
})

describe('what the phones are told', () => {
  it('says it once, not once a frame', () => {
    const state = room(['Wilf', 'Ida'])
    const first = stepObjectives(state, 16)
    const second = stepObjectives(state, 16)

    expect(first).toHaveLength(1)
    expect(first[0]?.to).toBe('*')
    expect(second).toEqual([])
  })

  it('says it again when the wording changes', () => {
    const state = room(['Wilf', 'Ida'])
    const objective = started(state)
    stepObjectives(state, 16)
    standOnIt(state, objective)
    const briefs = stepObjectives(state, 16)

    expect(briefs).toHaveLength(1)
    expect(briefs[0]?.detail).toBe('Hold it… 2')
  })

  /**
   * A brief is information. There is no field in it that could move a phone off
   * its joystick, and this is the test that says so out loud.
   */
  it('never carries anything that could put a phone into a mode', () => {
    const state = room(['Wilf', 'Ida'])
    const briefs = stepObjectives(state, 16)

    for (const brief of briefs) {
      // `Object.keys` is already a fresh array, so sorting it mutates nothing.
      // oxlint-disable-next-line unicorn/no-array-sort
      expect(Object.keys(brief).sort()).toEqual(['colour', 'detail', 'headline', 'to', 'tone'])
    }
  })

  it('tints the line with the colour of the spot they are looking for', () => {
    const state = room(['Wilf', 'Ida'])
    const objective = started(state)

    expect(banner(state)?.colour).toBe(objective.zones[0]?.colour)
  })

  it('has nothing to say to a phone the world has never heard of', () => {
    const state = room(['Wilf', 'Ida'])
    started(state)

    // The everybody line is what a stranger gets, because there is only ever one.
    expect(briefFor(state, 'ghost')?.to).toBe('*')
  })
})

describe('through the world', () => {
  /** `tick` is the only thing the renderer calls, so it has to carry the briefs. */
  it('steps the objective and hands back what the phones need to hear', () => {
    const state = room(['Wilf', 'Ida'])
    const result = tick(state, 16)

    expect(state.objectives.current).not.toBeNull()
    expect(result.briefs.map((brief) => brief.to)).toEqual(['*'])
    expect(tick(state, 16).briefs).toEqual([])
  })

  it('judges blobs where the movement left them, not where they started', () => {
    const state = room(['Wilf', 'Ida'])
    const objective = started(state)
    const zone = objective.zones[0]
    if (!zone) throw new Error('expected a zone')

    // Park them just off the spot and drive them onto it with the joystick,
    // stopping when they arrive exactly as a thumb coming off the pad would.
    for (const player of activePlayers(state)) {
      player.x = zone.x
      player.y = zone.y - 300
      player.dy = 1
    }
    for (let i = 0; i < 400; i++) {
      tick(state, 16)
      for (const player of activePlayers(state)) {
        if (contains(zone, player.x, player.y)) player.dy = 0
      }
    }

    expect(activePlayers(state).every((player) => contains(zone, player.x, player.y))).toBe(true)
    expect(state.objectives.score).toBe(SCORE_PER_OBJECTIVE)
  })
})
