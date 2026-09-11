import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, MAX_LEVEL, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { MAZE_CORRIDOR } from '../mazes.js'
import { insideObstacle } from '../obstacles.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { tick } from '../tick.js'
import { contains, type RectZone } from '../zones.js'
import { race, type RaceObjective } from './race.js'

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

/** A turning bar reaches its half-length in every direction; any other is only as wide as it is. */
function reachAcross(wall: ObstacleSweep): number {
  if (wall.motion?.kind === 'spin') return Math.hypot(wall.width, wall.height) / 2
  const bob = wall.motion?.kind === 'bob' ? Math.abs(wall.motion.reachX) : 0
  return wall.width / 2 + bob
}

function sweeps(wall: ObstacleSweep): { top: number; bottom: number }[] {
  if (wall.motion?.kind === 'spin') {
    const reach = Math.hypot(wall.width, wall.height) / 2
    return [{ top: wall.y - reach, bottom: wall.y + reach }]
  }
  const half = wall.height / 2
  const bob = wall.motion?.kind === 'bob' ? Math.abs(wall.motion.reachY) : 0
  return [
    { top: wall.y - bob - half, bottom: wall.y - bob + half },
    { top: wall.y + bob - half, bottom: wall.y + bob + half },
  ]
}

type ObstacleSweep = RaceObjective['obstacles'][number]

function moves(wall: ObstacleSweep): boolean {
  return wall.motion !== undefined
}

/** Floods a fine grid, because a blob meets the walls as emitted, not the reasoning behind them. */
function reachable(
  walls: readonly ObstacleSweep[],
  from: { x: number; y: number },
): (spot: { x: number; y: number }) => boolean {
  const step = BLOB_SIZE / 2
  const across = Math.floor(WORLD_WIDTH / step)
  const down = Math.floor(WORLD_HEIGHT / step)
  const key = (column: number, row: number) => row * across + column
  const blocked = (column: number, row: number) =>
    walls.some((wall) => insideObstacle(wall, column * step + step / 2, row * step + step / 2))

  const seen = new Set<number>()
  const start: [number, number] = [Math.floor(from.x / step), Math.floor(from.y / step)]
  const queue: [number, number][] = [start]
  seen.add(key(...start))
  while (queue.length > 0) {
    const [column, row] = queue.shift() as [number, number]
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const next: [number, number] = [column + dx, row + dy]
      if (next[0] < 0 || next[1] < 0 || next[0] >= across || next[1] >= down) continue
      if (seen.has(key(...next)) || blocked(...next)) continue
      seen.add(key(...next))
      queue.push(next)
    }
  }
  return (spot) => seen.has(key(Math.floor(spot.x / step), Math.floor(spot.y / step)))
}

function startOf(objective: RaceObjective): RectZone {
  const zone = objective.zones[0]
  if (!zone || zone.shape !== 'rect') throw new Error('expected a start pad')
  return zone
}

const finishOf = (objective: RaceObjective) => objective.zones[1]!
const gateOf = (objective: RaceObjective) =>
  objective.obstacles.find((wall) => wall.id.endsWith('-gate'))

function onTheStart(state: GameState, objective: RaceObjective): void {
  for (const player of activePlayers(state)) {
    player.x = startOf(objective).x
    player.y = startOf(objective).y
  }
}

/** Stops as the countdown begins, the only moment there is a gate to look at. */
function gathered(state: GameState, objective: RaceObjective): RaceObjective {
  onTheStart(state, objective)
  for (let frame = 0; frame < 200 && objective.phase === 'gathering'; frame++) {
    race.step(objective, state, 100)
  }
  expect(objective.phase).toBe('counting')
  return objective
}

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

  it('puts things in the way, and no gate until the room is gathered', () => {
    const objective = make(room(3))

    expect(gateOf(objective)).toBeUndefined()
    expect(objective.obstacles.length).toBeGreaterThan(0)
  })

  it('puts more in the way as the level goes up', () => {
    const easy = make(room(3), 1)
    const hard = make(room(3), MAX_LEVEL)

    expect(hard.obstacles.length).toBeGreaterThan(easy.obstacles.length)
  })

  /** Every rung's course, flooded with the gate gone, as it is actually run. */
  it('always leaves a way from the start line to the finish', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let seed = 0; seed < 10; seed++) {
        const objective = make(room(4), level, seed)
        const open = objective.obstacles.filter((wall) => !wall.id.endsWith('-gate'))
        const canReach = reachable(open, startOf(objective))

        expect(canReach(finishOf(objective))).toBe(true)
      }
    }
  })

  it('seals the floor from top to bottom when it goes up', () => {
    const state = room(4)
    const objective = gathered(state, make(state))
    const gate = gateOf(objective)!
    const start = startOf(objective)

    expect(gate.y - gate.height / 2).toBeLessThanOrEqual(0)
    expect(gate.y + gate.height / 2).toBeGreaterThanOrEqual(WORLD_HEIGHT)
    expect(gate.x).toBeGreaterThan(start.x)
    expect(gate.x - gate.width / 2).toBeLessThanOrEqual(start.x + start.width / 2)
  })

  it('sets the course moving as the level goes up, and then turning', () => {
    const easy = make(room(3), 1)
    const moving = make(room(3), 5)
    const turning = make(room(3), 6)

    expect(easy.obstacles.every((wall) => wall.motion === undefined)).toBe(true)
    expect(moving.obstacles.some((wall) => wall.motion?.kind === 'bob')).toBe(true)
    expect(turning.obstacles.some((wall) => wall.motion?.kind === 'spin')).toBe(true)
  })

  it('becomes a maze at the top of the ladder', () => {
    for (let seed = 0; seed < 10; seed++) {
      const maze = make(room(4), MAX_LEVEL, seed)
      const before = make(room(4), MAX_LEVEL - 2, seed)
      const walls = maze.obstacles.filter((wall) => !wall.id.endsWith('-gate'))

      // A straight run of cell walls is one rectangle, so this is fewer walls than it looks.
      expect(walls.length).toBeGreaterThan(3)
      expect(walls.length).toBeGreaterThan(before.obstacles.length)
      expect(maze.obstacles.every((wall) => wall.motion === undefined)).toBe(true)
    }
    // Two blobs wide, because the whole room goes through together.
    expect(MAZE_CORRIDOR).toBeGreaterThanOrEqual(BLOB_SIZE * 2)
  })

  it('gives the room longer for a course there is more of', () => {
    expect(make(room(4), MAX_LEVEL).totalMs).toBeGreaterThan(make(room(4), 3).totalMs)
  })

  /** Nothing that moves comes within a blob of a wall, and no two moving things can reach each other. */
  it('never puts a moving thing where it could pin a blob', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let seed = 0; seed < 10; seed++) {
        const objective = make(room(4), level, seed)
        const walls = objective.obstacles.filter((wall) => !wall.id.endsWith('-gate'))

        for (const wall of walls.filter(moves)) {
          for (const reach of sweeps(wall)) {
            // A hair of slack for a bar hung exactly against the top wall.
            expect(reach.top).toBeGreaterThanOrEqual(-0.001)
            expect(reach.bottom).toBeLessThanOrEqual(WORLD_HEIGHT + 0.001)
            const gap = Math.max(reach.top, WORLD_HEIGHT - reach.bottom)
            expect(gap).toBeGreaterThan(BLOB_SIZE * 1.4)
          }
        }
        // Walls that stand still may meet: a maze is made of them.
        const moving = walls.filter(moves)
        for (const [index, wall] of moving.entries()) {
          for (const other of moving.slice(index + 1)) {
            expect(Math.abs(wall.x - other.x)).toBeGreaterThan(
              reachAcross(wall) + reachAcross(other) + BLOB_SIZE,
            )
          }
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

describe('the gate', () => {
  it('goes up as the room finishes gathering, not before', () => {
    const state = room(3)
    const objective = make(state)
    expect(gateOf(objective)).toBeUndefined()

    gathered(state, objective)

    expect(objective.phase).toBe('counting')
    expect(gateOf(objective)).toBeDefined()
  })

  it('goes up when patience runs out as well', () => {
    const state = room(3)
    const objective = make(state)
    const dawdler = state.players.get('p3')!
    dawdler.x = WORLD_WIDTH / 2
    dawdler.y = WORLD_HEIGHT / 2

    for (let frame = 0; frame < 400 && objective.phase === 'gathering'; frame++) {
      race.step(objective, state, 100)
    }

    expect(objective.phase).toBe('counting')
    expect(gateOf(objective)).toBeDefined()
  })

  it('holds a blob driving flat at it', () => {
    const state = room(2)
    const objective = gathered(state, make(state))
    state.objectives.current = objective
    const runner = state.players.get('p1')!
    runner.x = startOf(objective).x
    runner.y = startOf(objective).y
    runner.dx = 1
    runner.dy = 0

    const gate = gateOf(objective)!
    for (let frame = 0; frame < 40; frame++) tick(state, 16)

    expect(insideObstacle(gate, runner.x, runner.y)).toBe(false)
    expect(runner.x).toBeLessThan(gate.x)
  })

  /** From a blob just inside the pad's right edge; it slides back over a few frames, never a teleport. */
  it('slides a blob it appears on top of back onto the pad', () => {
    const state = room(2)
    const objective = make(state)
    state.objectives.current = objective
    const runner = state.players.get('p1')!
    const start = startOf(objective)
    runner.x = start.x + start.width / 2 - 8
    runner.y = start.y

    gathered(state, objective)
    const gate = gateOf(objective)!
    for (let frame = 0; frame < 60; frame++) tick(state, 16)

    expect(insideObstacle(gate, runner.x, runner.y)).toBe(false)
    expect(runner.x).toBeLessThan(gate.x)
    expect(contains(start, runner.x, runner.y)).toBe(true)
  })

  it('is gone the moment the countdown is, and the course is not', () => {
    const state = room(2)
    const objective = started(state, make(state))

    expect(gateOf(objective)).toBeUndefined()
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
