import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { BLOB_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { hotPotato, type HotPotatoObjective } from './hotPotato.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `B${index}` })
  }
  // Spread out, so nobody is touching anybody until a test says so.
  let x = 100
  for (const player of state.players.values()) {
    player.x = x
    player.y = 360
    x += BLOB_SIZE * 3
  }
  return state
}

function make(state: GameState, level = 2, seed = 7): HotPotatoObjective {
  return hotPotato.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
  })
}

/** Put one blob right up against another, as driving into them does. */
function shoveInto(state: GameState, mover: string, target: string): void {
  const a = state.players.get(mover)!
  const b = state.players.get(target)!
  a.x = b.x + BLOB_SIZE
  a.y = b.y
}

/** Run the task on, in frames, without letting the buzzer go. */
function play(state: GameState, objective: HotPotatoObjective, ms: number): void {
  const step = 50
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    hotPotato.step(objective, state, step)
  }
}

describe('hot potato: generating', () => {
  it('starts somebody off with it, and says so on their blob', () => {
    const state = room(3)
    const objective = make(state)

    expect(objective.it).not.toBeNull()
    expect(state.players.has(objective.it as string)).toBe(true)
    expect(objective.marks).toEqual([{ playerId: objective.it, badge: expect.any(String) }])
    expect(objective.outcome).toBe('running')
    // Nothing on the floor: this one is entirely about who is touching whom.
    expect(objective.zones).toEqual([])
  })

  it('is the same task twice from the same seed, and a different one from another', () => {
    const state = room(3)
    expect(make(state, 2, 7)).toEqual(make(state, 2, 7))
    expect(make(state, 2, 7).totalMs).not.toBe(make(state, 2, 99).totalMs)
  })

  it('gives them less time and less safety the higher the level', () => {
    const state = room(3)
    const easy = make(state, 1)
    const hard = make(state, 8)

    expect(hard.totalMs).toBeLessThan(easy.totalMs)
    expect(hard.graceMs).toBeLessThan(easy.graceMs)
  })

  /**
   * Two blobs is a tag-back rather than a chase: the potato has nowhere to go
   * but back where it came from, and the joke needs somebody to run *to*.
   */
  it('needs three blobs, and joins the ladder after the simplest task', () => {
    expect(hotPotato.minPlayers).toBe(3)
    expect(hotPotato.minLevel).toBeGreaterThan(1)
  })

  /**
   * A chase across an empty floor is whoever is quickest; a chase round a
   * corner is a game. Every wall leaves a lane round it — a floor cut in two
   * is a floor half the blobs cannot get out of.
   */
  it('puts something on the floor to run round, and never a wall across it', () => {
    for (let seed = 0; seed < 40; seed++) {
      const objective = make(room(3), 5, seed)
      expect(objective.obstacles.length).toBeGreaterThan(0)
      for (const wall of objective.obstacles) {
        // Room for two blobs to pass either side of it, whichever way it runs.
        expect(WORLD_WIDTH - wall.width).toBeGreaterThan(BLOB_SIZE * 2)
        expect(WORLD_HEIGHT - wall.height).toBeGreaterThan(BLOB_SIZE * 2)
      }
    }
  })

  it('builds bigger walls the higher the level', () => {
    const area = (level: number): number =>
      make(room(3), level, 3).obstacles.reduce((sum, wall) => sum + wall.width * wall.height, 0)

    expect(area(8)).toBeGreaterThan(area(1))
  })
})

describe('hot potato: passing it on', () => {
  it('passes it to whoever the holder runs into', () => {
    const state = room(3)
    const objective = make(state)
    const holder = objective.it as string
    const victim = [...state.players.keys()].find((id) => id !== holder) as string

    play(state, objective, objective.graceMs + 100)
    shoveInto(state, holder, victim)
    hotPotato.step(objective, state, 50)

    expect(objective.it).toBe(victim)
    expect(objective.marks).toEqual([{ playerId: victim, badge: expect.any(String) }])
  })

  /**
   * Blobs are solid, so the two of them are still touching the moment it
   * changes hands. Without a breather it would flick back and forth every
   * frame and nobody would ever be chased anywhere.
   */
  it('cannot be handed straight back', () => {
    const state = room(2)
    const objective = make(state)
    const holder = objective.it as string
    const victim = [...state.players.keys()].find((id) => id !== holder) as string

    play(state, objective, objective.graceMs + 100)
    shoveInto(state, holder, victim)
    hotPotato.step(objective, state, 50)
    expect(objective.it).toBe(victim)

    // Still standing on top of each other, and it stays put.
    play(state, objective, objective.graceMs - 100)
    expect(objective.it).toBe(victim)

    // ...until the breather is over, and then it goes back.
    play(state, objective, 200)
    expect(objective.it).toBe(holder)
  })

  it('leaves it where it is while nobody is touching the holder', () => {
    const state = room(3)
    const objective = make(state)
    const holder = objective.it

    play(state, objective, 5_000)

    expect(objective.it).toBe(holder)
  })

  it('goes to the nearest of a huddle, not whoever happens to be first', () => {
    const state = room(3)
    const objective = make(state)
    const holder = state.players.get(objective.it as string)!
    const [near, far] = [...state.players.values()].filter((one) => one !== holder)

    near!.x = holder.x + BLOB_SIZE
    near!.y = holder.y
    far!.x = holder.x
    far!.y = holder.y + BLOB_SIZE + 2

    play(state, objective, objective.graceMs + 100)

    expect(objective.it).toBe(near!.playerId)
  })

  /**
   * A child who puts their phone down mid-chase must not take the game with
   * them. The potato lands on somebody who is still here.
   */
  it('finds it a new home when the blob holding it goes away', () => {
    const state = room(3)
    const objective = make(state)
    const holder = objective.it as string

    applyMessage(state, { type: 'left', playerId: holder })
    hotPotato.step(objective, state, 50)

    expect(objective.it).not.toBe(holder)
    expect(activePlayers(state).map((player) => player.playerId)).toContain(objective.it)
    expect(objective.outcome).toBe('running')
  })

  it('does the same when the blob holding it finishes and is forgotten', () => {
    const state = room(3)
    const objective = make(state)
    const holder = objective.it as string

    applyMessage(state, { type: 'finish', playerId: holder })
    hotPotato.step(objective, state, 50)

    expect(objective.it).not.toBe(holder)
    expect(state.players.has(objective.it as string)).toBe(true)
  })
})

describe('hot potato: the buzzer', () => {
  it('ends when the time is up, and says who was caught with it', () => {
    const state = room(3)
    const objective = make(state)
    objective.remainingMs = 0

    hotPotato.step(objective, state, 50)

    const holder = state.players.get(objective.it as string)!
    expect(objective.outcome).toBe('done')
    expect(objective.note).toContain(holder.name)
  })

  /**
   * Being caught with it is the joke, not a punishment: the buzzer is how this
   * task finishes, so the room is credited with having played it.
   */
  it('finishes rather than expires, so nothing is taken off anybody', () => {
    const state = room(3)
    const objective = make(state)
    objective.remainingMs = 0
    hotPotato.step(objective, state, 50)

    expect(objective.outcome).not.toBe('expired')
  })
})

describe('hot potato: what the phones are told', () => {
  it('names the holder and goes their colour', () => {
    const state = room(3)
    const objective = make(state)
    const holder = state.players.get(objective.it as string)!

    const [brief] = hotPotato.briefs(objective, state)

    expect(brief).toMatchObject({ to: '*', headline: 'Hot potato!', tone: 'task' })
    expect(brief?.detail).toContain(holder.name)
    expect(brief?.colour).toBe(holder.colour)
  })

  /** Everybody hears the same thing: this one is played by looking up. */
  it('tells everybody the same thing', () => {
    const state = room(3)
    const objective = make(state)

    expect(hotPotato.briefs(objective, state).map((brief) => brief.to)).toEqual(['*'])
  })
})
