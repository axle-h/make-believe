import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, MAX_LEVEL, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { insideObstacle } from '../obstacles.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { tick } from '../tick.js'
import { contains } from '../zones.js'
import { race, type RaceObjective } from './race.js'

/**
 * A wide start pad, a wide finish pad, and something in the way. The rule that
 * matters is that there is no rule: the start has a gate across it, every
 * joystick works throughout, and nobody can jump the gun because there is a
 * wall there.
 */

function room(count: number): GameState {
  const state = createGame(2)
  for (let index = 1; index <= count; index++) joinPlayer(state, `p${index}`, `B${index}`)
  return state
}

function make(state: GameState, level = 3, seed = 4): RaceObjective {
  return race.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

const startOf = (objective: RaceObjective) => objective.zones[0]!
const finishOf = (objective: RaceObjective) => objective.zones[1]!
const gateOf = (objective: RaceObjective) =>
  objective.obstacles.find((wall) => wall.id.endsWith('-gate'))

/** Put the whole room on the start line, as driving there does. */
function onTheStart(state: GameState, objective: RaceObjective): void {
  for (const player of activePlayers(state)) {
    player.x = startOf(objective).x
    player.y = startOf(objective).y
  }
}

/** Gather, count in, and hand back a race that has actually started. */
function started(state: GameState, objective: RaceObjective): RaceObjective {
  onTheStart(state, objective)
  for (let frame = 0; frame < 200 && objective.phase !== 'racing'; frame++) {
    race.step(objective, state, 100)
  }
  expect(objective.phase).toBe('racing')
  return objective
}

describe('laying out the course', () => {
  it('puts a start down one side and a finish down the other', () => {
    const objective = make(room(3))

    expect(startOf(objective).x).toBeLessThan(WORLD_WIDTH / 3)
    expect(finishOf(objective).x).toBeGreaterThan((WORLD_WIDTH * 2) / 3)
    expect(startOf(objective).label).toBe('START')
    expect(finishOf(objective).label).toBe('FINISH')
  })

  it('closes the start with a gate, and puts things in the way', () => {
    const objective = make(room(3))

    expect(gateOf(objective)).toBeDefined()
    expect(objective.obstacles.length).toBeGreaterThan(1)
  })

  it('puts more in the way as the level goes up', () => {
    const easy = make(room(3), 1)
    const hard = make(room(3), MAX_LEVEL)

    expect(hard.obstacles.length).toBeGreaterThan(easy.obstacles.length)
  })

  /** A course a blob cannot get through is a race nobody finishes. */
  it('always leaves a way past everything in the way', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let seed = 0; seed < 12; seed++) {
        const objective = make(room(4), level, seed)
        for (const wall of objective.obstacles) {
          if (wall.id.endsWith('-gate')) continue
          const above = wall.y - wall.height / 2
          const below = WORLD_HEIGHT - (wall.y + wall.height / 2)
          expect(Math.max(above, below)).toBeGreaterThan(BLOB_SIZE * 1.5)
        }
      }
    }
  })

  it('starts with no clock at all', () => {
    const objective = make(room(3))

    expect(objective.clock).toBe('held')
    expect(objective.phase).toBe('gathering')
  })
})

/**
 * "No false starts" is a wall rather than a rule. Every joystick works the
 * whole time; a blob shoving at the gate is a blob doing exactly what it
 * should.
 */
describe('the gate', () => {
  it('holds a blob driving flat at it', () => {
    const state = room(2)
    const objective = make(state)
    state.objectives.current = objective
    const runner = state.players.get('p1')!
    runner.x = startOf(objective).x
    runner.y = startOf(objective).y
    runner.dx = 1
    runner.dy = 0

    for (let frame = 0; frame < 120; frame++) tick(state, 16)

    const gate = gateOf(objective)!
    expect(insideObstacle(gate, runner.x, runner.y)).toBe(false)
    expect(runner.x).toBeLessThan(gate.x)
  })

  it('is gone the moment the countdown is', () => {
    const state = room(2)
    const objective = started(state, make(state))

    expect(gateOf(objective)).toBeUndefined()
    // Whatever else was in the way is still in the way.
    expect(objective.obstacles.length).toBeGreaterThan(0)
  })
})

describe('gathering, then counting', () => {
  it('does not count down until everybody present is on the line', () => {
    const state = room(3)
    const objective = make(state)
    onTheStart(state, objective)
    const straggler = state.players.get('p3')!
    straggler.x = WORLD_WIDTH / 2
    straggler.y = WORLD_HEIGHT / 2

    for (let frame = 0; frame < 100; frame++) race.step(objective, state, 100)

    expect(objective.phase).toBe('gathering')
    expect(objective.clock).toBe('held')
  })

  /**
   * "No time limit" means no pressure, not an evening that can stall. Somebody
   * present and dawdling must not be able to hold the room forever.
   */
  it('counts down anyway once its patience runs out', () => {
    const state = room(3)
    const objective = make(state)
    const dawdler = state.players.get('p3')!
    dawdler.x = WORLD_WIDTH / 2
    dawdler.y = WORLD_HEIGHT / 2

    for (let frame = 0; frame < 400 && objective.phase === 'gathering'; frame++) {
      race.step(objective, state, 100)
    }

    expect(objective.phase).not.toBe('gathering')
    expect(objective.gatheredMs).toBeGreaterThan(19_000)
  })

  it('says each number once, and then go', () => {
    const state = room(2)
    const objective = make(state)
    onTheStart(state, objective)
    const said: string[] = []

    for (let frame = 0; frame < 100; frame++) {
      race.step(objective, state, 100)
      if (objective.phase !== 'counting') break
      const headline = race.briefs(objective, state)[0]?.headline ?? ''
      if (said.at(-1) !== headline) said.push(headline)
    }

    expect(said).toEqual(['3', '2', '1', 'GO!'])
  })

  it('blips the room once a second, and gives GO one of its own', () => {
    const state = room(2)
    const objective = make(state)
    onTheStart(state, objective)
    state.objectives.sounds = []

    for (let frame = 0; frame < 100 && objective.phase !== 'racing'; frame++) {
      race.step(objective, state, 100)
    }

    const cues = state.objectives.sounds.map((sound) => sound.cue)
    expect(cues).toEqual(['count', 'count', 'count', 'go'])
  })

  it('starts the clock only when the race does', () => {
    const state = room(2)
    const objective = started(state, make(state))

    expect(objective.clock).toBe('running')
  })
})

describe('racing', () => {
  it('names whoever got there first', () => {
    const state = room(2)
    const objective = started(state, make(state))
    const first = state.players.get('p2')!
    first.x = finishOf(objective).x
    first.y = finishOf(objective).y

    race.step(objective, state, 16)

    expect(objective.firstHome).toBe(first.name)
    expect(objective.marks.map((mark) => mark.playerId)).toEqual(['p2'])
  })

  /**
   * The room is racing the course. There is a winner in it, and the last child
   * home still finishes rather than being stopped.
   */
  it('is done when everybody is home, not when the first one is', () => {
    const state = room(3)
    const objective = started(state, make(state))
    const finish = finishOf(objective)

    for (const id of ['p1', 'p2']) {
      const player = state.players.get(id)!
      player.x = finish.x
      player.y = finish.y
      race.step(objective, state, 16)
      expect(objective.outcome).toBe('running')
    }

    const last = state.players.get('p3')!
    last.x = finish.x
    last.y = finish.y
    race.step(objective, state, 16)

    expect(objective.outcome).toBe('done')
    expect(objective.note).toContain(objective.firstHome as string)
  })

  it('is judged against whoever is here now', () => {
    const state = room(3)
    const objective = started(state, make(state))
    const finish = finishOf(objective)
    for (const id of ['p1', 'p2']) {
      const player = state.players.get(id)!
      player.x = finish.x
      player.y = finish.y
    }
    state.players.delete('p3')

    race.step(objective, state, 16)

    expect(objective.outcome).toBe('done')
  })

  it('counts a blob home once, however long it stands there', () => {
    const state = room(3)
    const objective = started(state, make(state))
    const player = state.players.get('p1')!
    player.x = finishOf(objective).x
    player.y = finishOf(objective).y

    for (let frame = 0; frame < 20; frame++) race.step(objective, state, 16)

    expect(objective.home).toEqual(['p1'])
    expect(objective.marks).toHaveLength(1)
  })

  it('starts nobody off inside the finish', () => {
    for (let seed = 0; seed < 12; seed++) {
      const state = room(4)
      const objective = make(state, 3, seed)
      for (const player of activePlayers(state)) {
        expect(contains(finishOf(objective), player.x, player.y)).toBe(false)
      }
    }
  })
})

describe('what the phones are told', () => {
  it('counts who is on the start line while they gather', () => {
    const state = room(3)
    const objective = make(state)

    const [brief] = race.briefs(objective, state)

    expect(brief?.headline).toBe('To the start line!')
    expect(brief?.detail).toContain('0 of 3')
  })

  it('counts who is home once they are off', () => {
    const state = room(2)
    const objective = started(state, make(state))

    const [brief] = race.briefs(objective, state)

    expect(brief?.headline).toBe('Race to the other side!')
    expect(brief?.detail).toContain('0 of 2 home')
  })
})
