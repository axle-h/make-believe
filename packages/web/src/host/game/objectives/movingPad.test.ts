import { describe, expect, it } from 'vitest'
import { MAX_LEVEL, SPEED, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import { radiusFor } from '../zones.js'
import { MAX_DRIFT, movingPad, type MovingPadObjective } from './movingPad.js'

/**
 * The spot, with legs. The pad is the first thing in the game that moves the
 * floor about, which is why it comes before the race and the maze: everything
 * after it moves something.
 */

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) joinPlayer(state, `p${index}`, `B${index}`)
  return state
}

function make(state: GameState, level = 2, seed = 9): MovingPadObjective {
  return movingPad.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

/** Where the pad is now. It is the only zone this task has. */
function pad(objective: MovingPadObjective) {
  const zone = objective.zones[0]
  if (!zone || zone.shape !== 'circle') throw new Error('expected a circle')
  return zone
}

/** Everybody stands exactly where the pad is, and keeps up with it. */
function chase(state: GameState, objective: MovingPadObjective, ms: number, step = 50): void {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    movingPad.step(objective, state, step)
    for (const player of activePlayers(state)) {
      player.x = pad(objective).x
      player.y = pad(objective).y
    }
  }
}

describe('the pad that will not stay still', () => {
  it('drifts, rather than sitting where it was put', () => {
    const state = room(2)
    const objective = make(state)
    const from = { ...pad(objective) }

    movingPad.step(objective, state, 1_000)

    expect(Math.hypot(pad(objective).x - from.x, pad(objective).y - from.y)).toBeGreaterThan(20)
  })

  /**
   * A spot that leaves one side of the screen and appears at the other is a
   * spot six children lose. It bounces, and it stays wholly on the floor.
   */
  it('bounces off the walls and stays on the floor, however long it runs', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let seed = 0; seed < 6; seed++) {
        const state = room(3)
        const objective = make(state, level, seed)
        for (let frame = 0; frame < 800; frame++) {
          movingPad.step(objective, state, 50)
          const zone = pad(objective)
          expect(zone.x - zone.radius).toBeGreaterThanOrEqual(-0.001)
          expect(zone.y - zone.radius).toBeGreaterThanOrEqual(-0.001)
          expect(zone.x + zone.radius).toBeLessThanOrEqual(WORLD_WIDTH + 0.001)
          expect(zone.y + zone.radius).toBeLessThanOrEqual(WORLD_HEIGHT + 0.001)
        }
      }
    }
  })

  it('goes somewhere, rather than straight up and down forever', () => {
    for (let seed = 0; seed < 20; seed++) {
      const objective = make(room(2), 4, seed)
      expect(Math.abs(objective.vx)).toBeGreaterThan(1)
      expect(Math.abs(objective.vy)).toBeGreaterThan(1)
    }
  })

  it('runs faster and asks for a longer hold as the level goes up', () => {
    const easy = make(room(3), 1)
    const hard = make(room(3), MAX_LEVEL)

    expect(Math.hypot(hard.vx, hard.vy)).toBeGreaterThan(Math.hypot(easy.vx, easy.vy))
    expect(hard.holdMs).toBeGreaterThan(easy.holdMs)
  })

  /**
   * The promise the task rests on now: it is slow enough for the smallest
   * child in the room to keep up with on foot, however big the pad gets. It
   * used to be the other way round — the hold was always longer than a
   * crossing, so that standing still could never work — and that sentence was
   * protecting a rule about how the task ought to be played while the play
   * test said it was not being played at all, because the pad outran a
   * four-year-old.
   */
  it('never drifts faster than a blob can walk, however big the room', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let present = 2; present <= 10; present++) {
        const objective = make(room(present), level, present)
        expect(Math.hypot(objective.vx, objective.vy)).toBeLessThanOrEqual(MAX_DRIFT + 0.001)
      }
    }
  })

  /** And it never outruns the room chasing it, however big it gets. */
  it('drifts at well under the speed of the blobs chasing it', () => {
    for (let present = 2; present <= 10; present++) {
      const objective = make(room(present), MAX_LEVEL, present)
      expect(Math.hypot(objective.vx, objective.vy)).toBeLessThanOrEqual(SPEED * 0.75)
    }
  })

  /** However long the hold, there is time to get onto it and see it through. */
  it('asks for a hold that fits inside the time limit with room to spare', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let present = 2; present <= 10; present++) {
        const objective = make(room(present), level, present)
        expect(objective.holdMs).toBeLessThan(objective.totalMs / 2)
      }
    }
  })

  /** The whole room has to fit on it: it is the spot, and everybody stands on it. */
  it('is big enough for everybody, at every level and in every size of room', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let present = 2; present <= 10; present++) {
        const objective = make(room(present), level, present)
        expect(pad(objective).radius).toBeGreaterThanOrEqual(radiusFor(present, 1))
      }
    }
  })
})

describe('standing on it', () => {
  it('is done by keeping up with it for long enough', () => {
    const state = room(3)
    const objective = make(state)

    chase(state, objective, objective.holdMs + 200)

    expect(objective.outcome).toBe('done')
  })

  /**
   * The room still has to move. A blob left where the pad *was* is off it by
   * the time the count is up — which is the task — though a blob that happens
   * to be standing where the pad is going, and is still there at the end, is a
   * lucky blob rather than a bug. That is the whole of what changed when the
   * pad was slowed down for the smallest child in the room.
   */
  it('leaves a blob that stands where the pad used to be', () => {
    const state = room(3)
    const objective = make(state, MAX_LEVEL)
    const stayed = { x: pad(objective).x, y: pad(objective).y }
    for (const player of activePlayers(state)) {
      player.x = stayed.x
      player.y = stayed.y
    }

    for (let frame = 0; frame < 200; frame++) movingPad.step(objective, state, 50)

    const zone = pad(objective)
    expect(Math.hypot(zone.x - stayed.x, zone.y - stayed.y)).toBeGreaterThan(zone.radius)
  })

  it('waits for the last blob rather than the first', () => {
    const state = room(3)
    const objective = make(state)
    const straggler = state.players.get('p3')!

    chase(state, objective, objective.holdMs + 200)
    straggler.x = 40
    straggler.y = 40

    expect(objective.outcome).toBe('done')
  })

  it('is judged against whoever is here now', () => {
    const state = room(3)
    const objective = make(state)
    const gone = state.players.get('p3')!
    gone.x = 40
    gone.y = 40
    state.players.delete('p3')

    chase(state, objective, objective.holdMs + 200)

    expect(objective.outcome).toBe('done')
  })
})

describe('what the phones are told', () => {
  it('counts who is on it, in the colour of the pad', () => {
    const state = room(3)
    const objective = make(state)
    const [first, ...rest] = activePlayers(state)
    first!.x = pad(objective).x
    first!.y = pad(objective).y
    // The pad is wide enough for the whole room, so the others have to be put
    // somewhere it plainly is not for the count to mean anything.
    for (const player of rest) {
      player.x = WORLD_WIDTH - pad(objective).x
      player.y = WORLD_HEIGHT - pad(objective).y
    }

    const [brief] = movingPad.briefs(objective, state)

    expect(brief?.to).toBe('*')
    expect(brief?.detail).toContain('1 of 3')
    expect(brief?.colour).toBe(pad(objective).colour)
  })

  it('counts the hold down once everybody is on it', () => {
    const state = room(2)
    const objective = make(state)
    for (const player of activePlayers(state)) {
      player.x = pad(objective).x
      player.y = pad(objective).y
    }

    expect(movingPad.briefs(objective, state)[0]?.detail).toMatch(/^Hold it… \d$/)
  })
})
