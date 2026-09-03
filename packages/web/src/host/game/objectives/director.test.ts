import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import {
  BLOB_SIZE,
  COUNTDOWN_MS,
  INTERLUDE_MS,
  LEVEL_UP_AFTER,
  LEVEL_UP_INTERLUDE_MS,
  MAX_LEVEL,
  SCORE_PER_OBJECTIVE,
  UNSUITABLE_GRACE_MS,
} from '../constants.js'
import { activePlayers, objectives } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { tick } from '../tick.js'
import { contains } from '../zones.js'
import { askFor, banner, briefFor, setLevel, stepObjectives } from './director.js'
import type { DrawItObjective } from './drawIt.js'
import type { Brief, Objective } from './types.js'

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
 * Start the task this test is about. Which of the eligible templates the
 * director asks for is its own business, so a test that wants a particular one
 * puts back everything else until that one comes round — which it does, since
 * it never asks for the same thing twice running.
 */
function startedKind(state: GameState, kind: Objective['kind']): Objective {
  // Patient enough for the top of the ladder, where a dozen tasks are eligible
  // and the one wanted comes round about one roll in eleven.
  for (let attempt = 0; attempt < 200; attempt++) {
    const objective = started(state)
    if (objective.kind === kind) return objective
    state.objectives.current = null
  }
  throw new Error(`the director never asked for ${kind}`)
}

function startedOnTheSpot(state: GameState): Objective {
  return startedKind(state, 'onTheSpot')
}

/**
 * Watch a few tasks go by, however each of them ends, and say what they were.
 * The level is held where the test put it: this is about what one rung of the
 * ladder allows, and a room that levelled up halfway through would be answering
 * a different question.
 */
function kindsOverTime(state: GameState, count: number): Objective['kind'][] {
  const { level } = state.objectives
  const kinds: Objective['kind'][] = []
  while (kinds.length < count) {
    kinds.push(started(state).kind)
    runUntilFinished(state, 1_000)
    stepObjectives(state, INTERLUDE_MS + 1)
    state.objectives.level = level
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
    const state = room(['Wilf', 'Ida', 'Ted'], 5)
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
    const state = room(['Wilf', 'Ida', 'Ted'], 5)
    state.objectives.level = 2
    state.objectives.lastKind = 'onTheSpot'
    const objective = started(state)

    const shown = objectives(state).objective
    expect(shown?.marks).toEqual(objective.marks)
    expect(shown?.marks[0]?.playerId).toBe((objective as { it?: string }).it)
  })
})

/**
 * Some tasks have something to say to one phone that they are not saying to
 * the room. It is still only words: the phone it reaches can drive, talk and
 * draw exactly as every other phone can, and the TV still has its own line.
 */
describe('a line for one phone only', () => {
  function findingColours(state: GameState): Objective {
    state.objectives.level = 4
    return startedKind(state, 'findYourColour')
  }

  it('tells each phone something different, and the room something they all share', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 12)
    findingColours(state)

    const mine = briefFor(state, 'p1')
    const theirs = briefFor(state, 'p2')

    expect(mine?.to).toBe('p1')
    expect(mine?.detail).not.toBe(theirs?.detail)
    // ...and the TV is not told anybody's secret.
    expect(banner(state)?.to).toBe('*')
    expect(banner(state)?.detail).toBe('0 of 3 home')
  })

  it('tells a phone that turns up halfway through where it goes', () => {
    const state = room(['Wilf', 'Ida'], 12)
    findingColours(state)
    applyMessage(state, { type: 'join', playerId: 'p3', name: 'Ted' })
    stepObjectives(state, 16)

    expect(briefFor(state, 'p3')?.to).toBe('p3')
    expect(briefFor(state, 'p3')?.detail).toContain('pad')
  })

  /**
   * A phone left holding a private line about a task that is over would be the
   * one bit of the game that remembers a mode. When it ends, that phone is
   * given the line the room has, so it reads the cheer with everybody else.
   */
  it('puts the private line back to the room\'s as soon as the task is over', () => {
    const state = room(['Wilf', 'Ida'], 12)
    findingColours(state)

    let last: Brief[] = []
    for (let elapsed = 0; elapsed < 120_000; elapsed += 1_000) {
      last = stepObjectives(state, 1_000)
      if (state.objectives.current?.outcome !== 'running') break
    }

    const mine = last.find((brief) => brief.to === 'p1')
    expect(mine?.headline).toBe(state.objectives.current?.note)
    expect(mine?.detail).toBeUndefined()
    expect(briefFor(state, 'p1')?.to).toBe('*')
  })

  /**
   * The same thing, but in the middle of a task rather than at the end of one.
   * The crown moves from blob to blob, so the phone wearing it has a private
   * countdown one moment and not the next — and a child who has just had it
   * taken off them must not be the one person in the room with a blank strip.
   */
  it('hands a phone the room\'s line when its private one moves on mid-task', () => {
    const state = room(['Wilf', 'Ida'], 12)
    state.objectives.level = MAX_LEVEL
    const crown = startedKind(state, 'keepTheCrown')
    const wearing = () => state.objectives.current?.marks[0]?.playerId
    const wearer = wearing()

    // Stood right up against each other, as driving into somebody leaves them.
    const [first, second] = activePlayers(state)
    if (!first || !second) throw new Error('expected two blobs')
    second.x = first.x + BLOB_SIZE
    second.y = first.y

    let last: Brief[] = []
    for (let elapsed = 0; elapsed < 60_000 && wearing() === wearer; elapsed += 50) {
      last = stepObjectives(state, 50)
    }
    expect(wearing()).not.toBe(wearer)
    expect(state.objectives.current?.outcome).toBe('running')

    // The phone that has just lost it is told what everybody else is told.
    const mine = last.find((brief) => brief.to === wearer)
    expect(mine?.headline).toBe(crown.headline)
    expect(mine?.detail).toBe(last.find((brief) => brief.to === '*')?.detail)
    expect(mine?.detail).toContain('has it!')
  })
})

/**
 * Two tasks are about what a phone *says* rather than where it drives, and
 * they hear it through `applyMessage` — the same path a speech bubble takes.
 * Nothing about the Say box changes when one is running: it is the world that
 * has started listening, not the phone that has been handed a form to fill in.
 */
describe('a task that listens', () => {
  it('hears what a phone said, and can be finished by it', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 12)
    state.objectives.level = 6
    const objective = startedKind(state, 'drawIt') as DrawItObjective
    const guesser = activePlayers(state).find((player) => player.playerId !== objective.artist)
    if (!guesser) throw new Error('expected somebody to guess')

    applyMessage(state, { type: 'text', playerId: guesser.playerId, value: objective.word })

    expect(objective.outcome).toBe('done')
    // ...and it is still a speech bubble, exactly as it would be at any other moment.
    expect(guesser.bubble?.text).toBe(objective.word)

    stepObjectives(state, 16)
    expect(state.objectives.score).toBe(SCORE_PER_OBJECTIVE)
    expect(banner(state)?.tone).toBe('win')
  })

  it('ignores what phones say once it is over', () => {
    const state = room(['Wilf', 'Ida'], 12)
    state.objectives.level = 6
    const objective = startedKind(state, 'drawIt') as DrawItObjective
    const guesser = activePlayers(state).find((player) => player.playerId !== objective.artist)
    if (!guesser) throw new Error('expected somebody to guess')
    applyMessage(state, { type: 'text', playerId: guesser.playerId, value: objective.word })
    const first = objective.guesser

    applyMessage(state, { type: 'text', playerId: guesser.playerId, value: objective.word })

    expect(objective.guesser).toBe(first)
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

  /**
   * The other half of "a child who wanders off never leaves the others with
   * something they cannot finish": five blobs cannot be put in twos, so the
   * task goes rather than standing there being impossible.
   */
  it('drops a task the room has stopped suiting, once it is sure', () => {
    const state = room(['Wilf', 'Ida', 'Bo', 'Ada'])
    expect(askFor(state, 'pairs')).toBe(true)
    applyMessage(state, { type: 'join', playerId: 'p5', name: 'Ted' })

    // A moment's grace first: a phone that blinks is not a child who left.
    stepObjectives(state, 100)
    expect(state.objectives.current?.kind).toBe('pairs')

    for (let elapsed = 0; elapsed <= UNSUITABLE_GRACE_MS; elapsed += 100) {
      stepObjectives(state, 100)
      if (state.objectives.current === null) break
    }

    expect(state.objectives.current).toBeNull()
    expect(state.objectives.score).toBe(0)
  })

  it('is not taken down by a phone that flickers out of wifi and back', () => {
    const state = room(['Wilf', 'Ida', 'Bo', 'Ada', 'Ned', 'Fay'])
    askFor(state, 'pairs')
    const running = state.objectives.current

    applyMessage(state, { type: 'left', playerId: 'p6' })
    stepObjectives(state, 500)
    applyMessage(state, { type: 'join', playerId: 'p6', name: 'Fay' })
    for (let elapsed = 0; elapsed < UNSUITABLE_GRACE_MS * 2; elapsed += 100) {
      stepObjectives(state, 100)
    }

    expect(state.objectives.current).toBe(running)
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

/**
 * The hidden debug menu on the TV. It is a grown-up with a keyboard wanting to
 * look at the twelfth task without a room of children climbing to it first,
 * and it does nothing the director does not already do to itself.
 */
describe('asking for one task in particular', () => {
  it('puts that one up, whatever the ladder would have picked', () => {
    const state = room(['Wilf', 'Ida'])
    started(state)

    expect(askFor(state, 'sumo')).toBe(true)

    expect(state.objectives.current?.kind).toBe('sumo')
    expect(state.objectives.current?.outcome).toBe('running')
  })

  it('does it at whatever level the world is on, gate or no gate', () => {
    const state = room(['Wilf', 'Ida'])
    // The crown is the top of the ladder and the world has climbed nothing.
    expect(state.objectives.level).toBe(1)

    expect(askFor(state, 'keepTheCrown')).toBe(true)
    expect(state.objectives.current?.kind).toBe('keepTheCrown')
  })

  /**
   * The one thing it will not do. A task judged against two children when it
   * needs three is a task nobody in the room can finish, and the point of the
   * menu is to look at a task working.
   */
  it('refuses one the room is too small for, and leaves what is running alone', () => {
    const state = room(['Wilf', 'Ida'])
    const running = started(state)

    expect(askFor(state, 'hotPotato')).toBe(false)

    expect(state.objectives.current).toBe(running)
  })

  it('gives each one a fresh id, so the renderer knows it is new', () => {
    const state = room(['Wilf', 'Ida'])
    askFor(state, 'sumo')
    const first = state.objectives.current?.id
    askFor(state, 'sumo')

    expect(state.objectives.current?.id).not.toBe(first)
  })

  it('will not ask for the same thing again straight afterwards', () => {
    const state = room(['Wilf', 'Ida'])
    askFor(state, 'sumo')

    expect(state.objectives.lastKind).toBe('sumo')
  })
})

describe('moving the ladder by hand', () => {
  it('goes up and down, unlike anything the game itself does', () => {
    const state = room(['Wilf', 'Ida'])

    expect(setLevel(state, 6)).toBe(6)
    expect(setLevel(state, 2)).toBe(2)
    expect(state.objectives.level).toBe(2)
  })

  it('stays on the ladder at both ends', () => {
    const state = room(['Wilf', 'Ida'])

    expect(setLevel(state, 0)).toBe(1)
    expect(setLevel(state, MAX_LEVEL + 5)).toBe(MAX_LEVEL)
  })
})

/**
 * Going up a rung. It is the one thing all evening that is about the children
 * rather than about the game, so it is the one thing the world stops to say —
 * and it says it by asking them for whatever it has just unlocked.
 */
describe('going up a level', () => {
  /** Solve the simple spot until the room climbs a rung. */
  function climb(state: GameState): void {
    for (let round = 0; round < LEVEL_UP_AFTER; round++) {
      const objective = startedOnTheSpot(state)
      standOnIt(state, objective)
      runUntilFinished(state)
      if (round < LEVEL_UP_AFTER - 1) stepObjectives(state, INTERLUDE_MS + 1)
    }
  }

  it('says which level, in the big line, and not as a win or a miss', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    climb(state)

    const line = banner(state)
    expect(line?.headline).toBe('Level 2!')
    expect(line?.tone).toBe('level')
    // What the task itself had to say drops to the second line rather than
    // being lost: both are worth reading.
    expect(line?.detail).toBeTruthy()
  })

  it('gives the room longer to look at it than an ordinary breather', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    climb(state)

    expect(state.objectives.interludeMs).toBe(LEVEL_UP_INTERLUDE_MS)
    expect(LEVEL_UP_INTERLUDE_MS).toBeGreaterThan(INTERLUDE_MS)
  })

  /** A level that unlocks something and then asks for the same old spot has not visibly done anything. */
  it('asks for whatever that level just unlocked, before anything else', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    climb(state)
    expect(state.objectives.pending).toEqual(['hotPotato'])

    stepObjectives(state, LEVEL_UP_INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.current?.kind).toBe('hotPotato')
    // Taken off the queue: the next one after it is the director's own choice.
    expect(state.objectives.pending).toEqual([])
  })

  /** The level message belongs to the breather, not to the task behind it. */
  it('stops saying it once the next task is up', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    climb(state)
    stepObjectives(state, LEVEL_UP_INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.levelledUpTo).toBeNull()
    expect(banner(state)?.tone).toBe('task')
  })

  /**
   * A room of two cannot play hot potato, and a new task nobody ever saw is a
   * level that did nothing. It waits on the queue instead of being thrown away.
   */
  it('holds a newly unlocked task back until there are blobs enough for it', () => {
    const state = room(['Wilf', 'Ida'])
    climb(state)
    stepObjectives(state, LEVEL_UP_INTERLUDE_MS + 1)
    const instead = started(state)

    expect(instead.kind).toBe('onTheSpot')
    expect(state.objectives.pending).toEqual(['hotPotato'])

    // A third blob turns up, and the moment there is room for it, it is next.
    applyMessage(state, { type: 'join', playerId: 'p3', name: 'Ted' })
    standOnIt(state, instead)
    runUntilFinished(state)
    stepObjectives(state, INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.current?.kind).toBe('hotPotato')
  })

  /** Two unlock together at some rungs; both go first, one after the other. */
  it('queues everything a rung unlocks, not just the first of them', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    state.objectives.level = 2
    state.objectives.streak = LEVEL_UP_AFTER - 1
    const objective = startedOnTheSpot(state)
    standOnIt(state, objective)
    runUntilFinished(state)

    expect(state.objectives.level).toBe(3)
    expect(state.objectives.pending).toEqual(['pairs', 'followTheChain'])
  })

  /** At the top there is nothing left to unlock and nothing to announce. */
  it('says nothing at the top of the ladder, where the level stops moving', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    state.objectives.level = MAX_LEVEL
    state.objectives.streak = LEVEL_UP_AFTER - 1
    const objective = startedOnTheSpot(state)
    standOnIt(state, objective)
    runUntilFinished(state)

    expect(state.objectives.level).toBe(MAX_LEVEL)
    expect(state.objectives.levelledUpTo).toBeNull()
    expect(state.objectives.pending).toEqual([])
    expect(banner(state)?.tone).toBe('win')
  })
})

/**
 * The breather between one task and the next. It is not a gap in play — every
 * phone can still drive, talk and draw right through it — but it is long
 * enough that the room has to be told the game has not stopped.
 */
describe('counting down to the next task', () => {
  function finishOne(state: GameState): void {
    const objective = startedOnTheSpot(state)
    standOnIt(state, objective)
    runUntilFinished(state)
  }

  it('says nothing about the clock until the last few seconds', () => {
    const state = room(['Wilf', 'Ida'])
    finishOne(state)

    expect(state.objectives.interludeMs).toBeGreaterThan(COUNTDOWN_MS)
    expect(banner(state)?.detail).toBeUndefined()
  })

  it('counts the last seconds down, one message a second', () => {
    const state = room(['Wilf', 'Ida'])
    finishOne(state)
    stepObjectives(state, INTERLUDE_MS - COUNTDOWN_MS)

    expect(banner(state)?.detail).toBe('Next game in 5s')

    const said: (string | undefined)[] = []
    for (let frame = 0; frame < 5_000 / 100; frame++) {
      stepObjectives(state, 100)
      said.push(banner(state)?.detail)
    }

    // Every whole second is said once, in order, and never a nought.
    expect([...new Set(said)]).toEqual([
      'Next game in 5s',
      'Next game in 4s',
      'Next game in 3s',
      'Next game in 2s',
      'Next game in 1s',
      undefined,
    ])
  })

  it('only puts the changed line on the wire, so a countdown is five messages', () => {
    const state = room(['Wilf', 'Ida'])
    finishOne(state)
    stepObjectives(state, INTERLUDE_MS - COUNTDOWN_MS - 1)

    let sent = 0
    for (let frame = 0; frame < COUNTDOWN_MS / 100; frame++) {
      sent += stepObjectives(state, 100).length
    }

    expect(sent).toBe(5)
  })
})
