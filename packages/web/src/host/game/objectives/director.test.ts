import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import {
  AWAY_TIMEOUT_MS,
  BLOB_SIZE,
  COUNTDOWN_MS,
  CROWN_BADGE,
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
import { eligibleTemplates, unlockedAt } from './registry.js'
import type { FetchObjective } from './fetch.js'
import type { KeepTheCrownObjective } from './keepTheCrown.js'
import type { DrawItObjective } from './drawIt.js'
import type { Brief, Objective } from './types.js'
import { joinPlayer } from '../testRoom.js'

// As much about what the director never does (make anybody wait, take anything away) as what it does.

function room(names: string[], seed = 1): GameState {
  const state = createGame(seed)
  for (const [index, name] of names.entries()) {
    joinPlayer(state, `p${index + 1}`, name)
  }
  return state
}

function briefsFrom(state: GameState, dtMs: number): Brief[] {
  return stepObjectives(state, dtMs).briefs
}

function started(state: GameState): Objective {
  stepObjectives(state, 16)
  const objective = state.objectives.current
  if (!objective) throw new Error('expected an objective')
  return objective
}

/** Puts tasks back until the wanted one comes round, which it must since none repeats. */
function startedKind(state: GameState, kind: Objective['kind']): Objective {
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

/** The level is held where the test put it, so the answer is about that one rung. */
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

function standOnIt(state: GameState, objective: Objective): void {
  const zone = objective.zones[0]
  if (!zone) throw new Error('expected a zone')
  for (const player of activePlayers(state)) {
    player.x = zone.x
    player.y = zone.y
  }
}

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
    joinPlayer(state, 'p2', 'Ida')
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

describe('a ladder of tasks', () => {
  it('keeps the harder task off the floor until the room has levelled up', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 3)

    expect(new Set(kindsOverTime(state, 6))).toEqual(new Set(['onTheSpot']))
  })

  it('asks for something else once the room has levelled up', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 3)
    state.objectives.level = 2
    const allowed = new Set(eligibleTemplates(2, 3).map((template) => template.kind))

    const played = new Set(kindsOverTime(state, 8))

    expect(played.size).toBeGreaterThan(1)
    for (const kind of played) expect(allowed.has(kind)).toBe(true)
  })

  it('never asks for the same thing twice running', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 5)
    state.objectives.level = 4
    const kinds = kindsOverTime(state, 8)

    for (const [index, kind] of kinds.entries()) {
      if (index > 0) expect(kind).not.toBe(kinds[index - 1])
    }
  })

  it('repeats itself only when there is nothing else it could ask for', () => {
    const state = room(['Wilf', 'Ida'], 5)

    expect(kindsOverTime(state, 3)).toEqual(['onTheSpot', 'onTheSpot', 'onTheSpot'])
  })

  it('lets a task say for itself how it ended', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 5)
    state.objectives.level = 2
    const objective = startedKind(state, 'hotPotato')

    runUntilFinished(state, 1_000)

    expect(objective.note).toContain('holding it')
    expect(banner(state)?.tone).toBe('win')
    expect(state.objectives.score).toBe(SCORE_PER_OBJECTIVE)
  })

  it('puts what the task has pinned to a blob into the snapshot', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 5)
    state.objectives.level = 2
    const objective = startedKind(state, 'hotPotato')

    const shown = objectives(state).objective
    expect(shown?.marks).toEqual(objective.marks)
    expect(shown?.marks[0]?.playerId).toBe((objective as { it?: string }).it)
  })
})

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
    expect(banner(state)?.to).toBe('*')
    expect(banner(state)?.detail).toBe('0 of 3 home')
  })

  it('tells a phone that turns up halfway through where it goes', () => {
    const state = room(['Wilf', 'Ida'], 12)
    findingColours(state)
    joinPlayer(state, 'p3', 'Ted')
    stepObjectives(state, 16)

    expect(briefFor(state, 'p3')?.to).toBe('p3')
    expect(briefFor(state, 'p3')?.detail).toContain('pad')
  })

  it('puts the private line back to the room\'s as soon as the task is over', () => {
    const state = room(['Wilf', 'Ida'], 12)
    findingColours(state)

    let last: Brief[] = []
    for (let elapsed = 0; elapsed < 120_000; elapsed += 1_000) {
      last = stepObjectives(state, 1_000).briefs
      if (state.objectives.current?.outcome !== 'running') break
    }

    const mine = last.find((brief) => brief.to === 'p1')
    expect(mine?.headline).toBe(state.objectives.current?.note)
    expect(mine?.detail).toBeUndefined()
    expect(briefFor(state, 'p1')?.to).toBe('*')
  })

  /** From a crown taken off one blob by another, which must not leave its phone blank. */
  it('hands a phone the room\'s line when its private one moves on mid-task', () => {
    const state = room(['Wilf', 'Ida'], 12)
    state.objectives.level = MAX_LEVEL
    const crown = startedKind(state, 'keepTheCrown')
    const wearing = () => state.objectives.current?.marks[0]?.playerId
    const wearer = wearing()

    const [first, second] = activePlayers(state)
    if (!first || !second) throw new Error('expected two blobs')
    second.x = first.x + BLOB_SIZE
    second.y = first.y

    let last: Brief[] = []
    for (let elapsed = 0; elapsed < 60_000 && wearing() === wearer; elapsed += 50) {
      last = stepObjectives(state, 50).briefs
    }
    expect(wearing()).not.toBe(wearer)
    expect(state.objectives.current?.outcome).toBe('running')

    const mine = last.find((brief) => brief.to === wearer)
    expect(mine?.headline).toBe(crown.headline)
    expect(mine?.detail).toBe(last.find((brief) => brief.to === '*')?.detail)
    expect(mine?.detail).toContain('has it!')
  })
})

// Talking tasks hear through `applyMessage`, the path a speech bubble takes; the phone changes nothing.
describe('a task that listens', () => {
  it('hears what a phone said, and can be finished by it', () => {
    const state = room(['Wilf', 'Ida', 'Ted'], 12)
    state.objectives.level = 6
    const objective = startedKind(state, 'drawIt') as DrawItObjective
    const guesser = activePlayers(state).find((player) => player.playerId !== objective.artist)
    if (!guesser) throw new Error('expected somebody to guess')

    applyMessage(state, { type: 'text', playerId: guesser.playerId, value: objective.word })

    expect(objective.outcome).toBe('done')
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

    joinPlayer(state, 'p3', 'Ted')
    const brief = briefFor(state, 'p3')

    expect(brief?.headline).toBe(objective.headline)
    expect(brief?.detail).toBe('2 of 3 on the spot')

    stepObjectives(state, 5_000)
    expect(objective.outcome).toBe('running')
    standOnIt(state, objective)
    runUntilFinished(state)
    expect(objective.outcome).toBe('done')
  })

  /** From five blobs asked to pair up. */
  it('drops a task the room has stopped suiting, once it is sure', () => {
    const state = room(['Wilf', 'Ida', 'Bo', 'Ada'])
    expect(askFor(state, 'pairs')).toBe(true)
    joinPlayer(state, 'p5', 'Ted')

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
    joinPlayer(state, 'p6', 'Fay')
    for (let elapsed = 0; elapsed < UNSUITABLE_GRACE_MS * 2; elapsed += 100) {
      stepObjectives(state, 100)
    }

    expect(state.objectives.current).toBe(running)
  })

  it('does not count the clock down while a task is holding it', () => {
    const state = room(['Wilf', 'Ida'])
    expect(askFor(state, 'race')).toBe(true)
    const gathering = state.objectives.current
    expect(gathering?.clock).toBe('held')

    for (let elapsed = 0; elapsed < 10_000; elapsed += 100) stepObjectives(state, 100)

    expect(gathering?.clock).toBe('held')
    expect(gathering?.remainingMs).toBe(gathering?.totalMs)
  })

  it('does not run a held task out of time', () => {
    const state = room(['Wilf', 'Ida'])
    askFor(state, 'race')
    const gathering = state.objectives.current
    if (!gathering) throw new Error('expected a race')
    gathering.remainingMs = 0

    stepObjectives(state, 100)

    expect(gathering.outcome).toBe('running')
    expect(state.objectives.current).toBe(gathering)
  })

  it('abandons quietly when the room drops below what the task needs', () => {
    const state = room(['Wilf', 'Ida'])
    started(state)
    applyMessage(state, { type: 'left', playerId: 'p2' })
    stepObjectives(state, 16)

    expect(state.objectives.current).toBeNull()
    expect(state.objectives.score).toBe(0)
    expect(banner(state)?.headline).toBe('Waiting for another blob…')
    expect(banner(state)?.tone).toBe('task')
  })
})

function crowned(state: GameState): string {
  askFor(state, 'keepTheCrown')
  const game = state.objectives.current as KeepTheCrownObjective
  stepObjectives(state, 1_000)
  game.remainingMs = 0
  stepObjectives(state, 16)
  expect(game.outcome).toBe('done')
  return state.objectives.crown as string
}

describe('the crown', () => {
  it('stays on its wearer through the breather and into the next task', () => {
    const state = room(['Wilf', 'Ida'])
    const wearer = crowned(state)
    expect(wearer).not.toBeNull()

    stepObjectives(state, INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.current?.kind).not.toBe('keepTheCrown')
    expect(state.objectives.crown).toBe(wearer)
    expect(objectives(state).marks).toEqual([{ playerId: wearer, badge: CROWN_BADGE }])
  })

  it('is drawn once, by the game that is playing for it', () => {
    const state = room(['Wilf', 'Ida'])
    crowned(state)
    stepObjectives(state, INTERLUDE_MS + 1)
    askFor(state, 'keepTheCrown')

    expect(objectives(state).marks).toEqual([])
    expect(objectives(state).objective?.marks).toHaveLength(1)
  })

  it('is nobody\'s once its wearer has finished with their blob', () => {
    const state = room(['Wilf', 'Ida'])
    const wearer = crowned(state)

    applyMessage(state, { type: 'finish', playerId: wearer })

    expect(state.objectives.crown).toBeNull()
    expect(objectives(state).marks).toEqual([])
  })

  it('is nobody\'s once its wearer has been forgotten for good', () => {
    const state = room(['Wilf', 'Ida'])
    const wearer = crowned(state)
    applyMessage(state, { type: 'left', playerId: wearer })

    tick(state, AWAY_TIMEOUT_MS + 1)

    expect(state.objectives.crown).toBeNull()
  })
})

describe('what the phones are told', () => {
  it('says it once, not once a frame', () => {
    const state = room(['Wilf', 'Ida'])
    const first = briefsFrom(state, 16)
    const second = briefsFrom(state, 16)

    expect(first).toHaveLength(1)
    expect(first[0]?.to).toBe('*')
    expect(second).toEqual([])
  })

  it('says it again when only the painted word changes', () => {
    const state = room(['Wilf', 'Ida'])
    askFor(state, 'fetch')
    stepObjectives(state, 16)
    expect(briefsFrom(state, 16)).toEqual([])

    const errand = state.objectives.current as FetchObjective
    errand.things = 'kumquats'

    expect(briefsFrom(state, 16)).toHaveLength(1)
  })

  it('says it again when the wording changes', () => {
    const state = room(['Wilf', 'Ida'])
    const objective = started(state)
    stepObjectives(state, 16)
    standOnIt(state, objective)
    const briefs = briefsFrom(state, 16)

    expect(briefs).toHaveLength(1)
    expect(briefs[0]?.detail).toBe('Hold it… 2')
  })

  it('never carries anything that could put a phone into a mode', () => {
    const state = room(['Wilf', 'Ida'])
    const briefs = briefsFrom(state, 16)

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

    expect(briefFor(state, 'ghost')?.to).toBe('*')
  })
})

describe('through the world', () => {
  /** `tick` is all the renderer calls, so it has to carry the briefs. */
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

    // Driven on with the joystick and let go on arrival, as a thumb would.
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
    expect(state.objectives.level).toBe(1)

    expect(askFor(state, 'keepTheCrown')).toBe(true)
    expect(state.objectives.current?.kind).toBe('keepTheCrown')
  })

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

describe('going up a level', () => {
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
    expect(line?.detail).toBeTruthy()
  })

  it('gives the room longer to look at it than an ordinary breather', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    climb(state)

    expect(state.objectives.interludeMs).toBe(LEVEL_UP_INTERLUDE_MS)
    expect(LEVEL_UP_INTERLUDE_MS).toBeGreaterThan(INTERLUDE_MS)
  })

  it('asks for whatever that level just unlocked, before anything else', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    climb(state)
    expect(state.objectives.pending).toEqual(unlockedAt(2))

    stepObjectives(state, LEVEL_UP_INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.current?.kind).toBe(unlockedAt(2)[0])
    expect(state.objectives.pending).toEqual(unlockedAt(2).slice(1))
  })

  it('stops saying it once the next task is up', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    climb(state)
    stepObjectives(state, LEVEL_UP_INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.levelledUpTo).toBeNull()
    expect(banner(state)?.tone).toBe('task')
  })

  it('holds a newly unlocked task back until there are blobs enough for it', () => {
    const state = room(['Wilf', 'Ida'])
    climb(state)
    stepObjectives(state, LEVEL_UP_INTERLUDE_MS + 1)
    const instead = started(state)

    // Hot potato wants three, so it waits.
    expect(instead.kind).not.toBe('hotPotato')
    expect(state.objectives.pending).toEqual(['hotPotato'])

    joinPlayer(state, 'p3', 'Ted')
    standOnIt(state, instead)
    runUntilFinished(state)
    stepObjectives(state, INTERLUDE_MS + 1)
    stepObjectives(state, 16)

    expect(state.objectives.current?.kind).toBe('hotPotato')
  })

  it('queues everything a rung unlocks, not just the first of them', () => {
    const state = room(['Wilf', 'Ida', 'Ted'])
    state.objectives.level = 2
    state.objectives.streak = LEVEL_UP_AFTER - 1
    const objective = startedOnTheSpot(state)
    standOnIt(state, objective)
    runUntilFinished(state)

    expect(state.objectives.level).toBe(3)
    expect(state.objectives.pending).toEqual(unlockedAt(3))
    expect(state.objectives.pending.length).toBeGreaterThan(1)
  })

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
      sent += briefsFrom(state, 100).length
    }

    expect(sent).toBe(5)
  })
})
