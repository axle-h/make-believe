import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { BLOB_SIZE, MAX_LEVEL } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { keepTheCrown, type KeepTheCrownObjective } from './keepTheCrown.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `Blob ${index}` })
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

function make(state: GameState, level = MAX_LEVEL, seed = 7): KeepTheCrownObjective {
  return keepTheCrown.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
  })
}

/** Put one blob right up against another, as driving into them does. */
function shoveInto(state: GameState, mover: string, target: string): void {
  const a = state.players.get(mover)
  const b = state.players.get(target)
  if (!a || !b) throw new Error('both blobs should be here')
  a.x = b.x + BLOB_SIZE
  a.y = b.y
}

/** Run it on until the crown changes hands, or give up rather than hang. */
function playUntilItMoves(state: GameState, objective: KeepTheCrownObjective): void {
  const wearer = objective.wearer
  for (let frame = 0; frame < 200 && objective.wearer === wearer; frame++) {
    keepTheCrown.step(objective, state, 50)
  }
}

/** Run the task on, in frames, without letting the buzzer go. */
function play(state: GameState, objective: KeepTheCrownObjective, ms: number): void {
  const step = 50
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    keepTheCrown.step(objective, state, step)
  }
}

describe('keep the crown: generating', () => {
  it('starts somebody off wearing it, and says so on their blob', () => {
    const state = room(3)
    const objective = make(state)

    expect(objective.wearer).not.toBeNull()
    expect(state.players.has(objective.wearer as string)).toBe(true)
    expect(objective.marks).toEqual([{ playerId: objective.wearer, badge: expect.any(String) }])
    expect(objective.outcome).toBe('running')
    // Nothing on the floor: the crown is worn, not carried about.
    expect(objective.zones).toEqual([])
    expect(objective.carryables).toEqual([])
  })

  it('is the same task twice from the same seed, and a different one from another', () => {
    const state = room(3)
    expect(make(state, MAX_LEVEL, 7)).toEqual(make(state, MAX_LEVEL, 7))
    expect(make(state, MAX_LEVEL, 7).totalMs).not.toBe(make(state, MAX_LEVEL, 99).totalMs)
  })

  it('asks them to keep it longer, with less safety, the higher the level', () => {
    const state = room(3)
    const easy = make(state, 1)
    const hard = make(state, MAX_LEVEL)

    expect(hard.crownMs).toBeGreaterThan(easy.crownMs)
    expect(hard.graceMs).toBeLessThan(easy.graceMs)
  })

  it('needs two blobs, and is the last thing the ladder unlocks', () => {
    expect(keepTheCrown.minPlayers).toBe(2)
    expect(keepTheCrown.minLevel).toBe(MAX_LEVEL)
  })
})

describe('keep the crown: wearing it', () => {
  it('banks the time while somebody has it, and nothing for anybody else', () => {
    const state = room(3)
    const objective = make(state)
    const wearer = objective.wearer as string

    play(state, objective, 1_000)

    expect(objective.wornMs[wearer]).toBeCloseTo(1_000, 5)
    for (const player of activePlayers(state)) {
      if (player.playerId === wearer) continue
      expect(objective.wornMs[player.playerId]).toBeUndefined()
    }
  })

  it('is taken by driving into whoever has it, once their moment is up', () => {
    const state = room(3)
    const objective = make(state)
    const wearer = objective.wearer as string
    const thief = activePlayers(state).find((player) => player.playerId !== wearer)?.playerId
    expect(thief).toBeDefined()

    shoveInto(state, thief as string, wearer)
    play(state, objective, objective.graceMs + 100)

    expect(objective.wearer).toBe(thief)
    expect(objective.marks).toEqual([{ playerId: thief, badge: expect.any(String) }])
  })

  /** Otherwise it flickers back and forth every frame two blobs are touching. */
  it('cannot be taken back the instant it changes hands', () => {
    const state = room(2)
    const objective = make(state)
    const wearer = objective.wearer as string
    const thief = activePlayers(state).find((player) => player.playerId !== wearer)?.playerId

    shoveInto(state, thief as string, wearer)
    playUntilItMoves(state, objective)
    expect(objective.wearer).toBe(thief)

    // Still stood right on top of each other, and it stays theirs anyway.
    play(state, objective, objective.graceMs - 100)
    expect(objective.wearer).toBe(thief)
  })

  /**
   * Two blobs parked in a huddle trade it every few seconds and neither of
   * them gets anywhere, which is right: the way to keep the crown is to drive
   * off with it, not to stand next to whoever has it.
   */
  it('goes round and round between two blobs that will not move', () => {
    const state = room(2)
    const objective = make(state)
    const wearer = objective.wearer as string
    const thief = activePlayers(state).find((player) => player.playerId !== wearer)?.playerId
    shoveInto(state, thief as string, wearer)

    playUntilItMoves(state, objective)
    expect(objective.wearer).toBe(thief)
    playUntilItMoves(state, objective)

    expect(objective.wearer).toBe(wearer)
    expect(objective.outcome).toBe('running')
  })

  /**
   * Having it stolen costs a child the crown, never the time they already
   * spent keeping it. Nothing in this game takes anything back.
   */
  it('keeps what a blob has already worn when the crown is taken off it', () => {
    const state = room(2)
    const objective = make(state)
    const wearer = objective.wearer as string
    const thief = activePlayers(state).find((player) => player.playerId !== wearer)?.playerId

    play(state, objective, 2_000)
    const banked = objective.wornMs[wearer] ?? 0
    expect(banked).toBeGreaterThan(0)

    // Their moment of safety is long gone, so the touch takes it at once.
    shoveInto(state, thief as string, wearer)
    keepTheCrown.step(objective, state, 50)

    expect(objective.wearer).toBe(thief)
    expect(objective.wornMs[wearer]).toBeGreaterThanOrEqual(banked)
  })
})

describe('keep the crown: ending', () => {
  it('is won by keeping it long enough, and says who did', () => {
    const state = room(2)
    const objective = make(state)
    const wearer = objective.wearer as string

    play(state, objective, objective.crownMs + 100)

    expect(objective.outcome).toBe('done')
    expect(objective.note).toContain(state.players.get(wearer)?.name)
  })

  /** Nobody managed to keep it: still a good game, and still worth a cheer. */
  it('goes to whoever wore it longest when the buzzer beats them to it', () => {
    const state = room(2)
    const objective = make(state)
    const wearer = objective.wearer as string
    // Long enough to have worn it, nothing like long enough to have won it.
    play(state, objective, 1_000)
    objective.remainingMs = 0
    play(state, objective, 50)

    expect(objective.outcome).toBe('done')
    expect(objective.note).toContain(state.players.get(wearer)?.name)
  })

  /**
   * Judged against whoever is here now: a phone put down while its blob was
   * wearing the crown hands it straight back to the room rather than running
   * the clock down in a corner with it.
   */
  it('gives the crown to somebody still here when its wearer goes away', () => {
    const state = room(3)
    const objective = make(state)
    const wearer = objective.wearer as string
    applyMessage(state, { type: 'left', playerId: wearer })

    play(state, objective, 100)

    expect(objective.wearer).not.toBe(wearer)
    expect(state.players.get(objective.wearer as string)?.away).toBe(false)
  })

  it('does not hand the crown to a blob that has gone for good', () => {
    const state = room(2)
    const objective = make(state)
    const wearer = objective.wearer as string
    applyMessage(state, { type: 'finish', playerId: wearer })

    play(state, objective, objective.crownMs + 100)

    expect(objective.wearer).not.toBe(wearer)
    expect(objective.note).not.toContain('undefined')
  })

  it('does nothing at all in a room that has emptied out', () => {
    const state = room(2)
    const objective = make(state)
    for (const player of activePlayers(state)) {
      applyMessage(state, { type: 'left', playerId: player.playerId })
    }

    play(state, objective, 5_000)

    expect(objective.outcome).toBe('running')
  })
})

describe('keep the crown: what the phones are told', () => {
  it('tells the room who to go for, in that blob\'s own colour', () => {
    const state = room(3)
    const objective = make(state)
    const wearer = state.players.get(objective.wearer as string)
    const shared = keepTheCrown.briefs(objective, state).find((brief) => brief.to === '*')

    expect(shared?.detail).toContain(wearer?.name)
    expect(shared?.colour).toBe(wearer?.colour)
  })

  /** The one phone being chased is the one that wants a countdown. */
  it('counts the wearer down privately, and nobody else', () => {
    const state = room(3)
    const objective = make(state)
    const wearer = objective.wearer as string
    play(state, objective, 1_000)

    const briefs = keepTheCrown.briefs(objective, state)
    const mine = briefs.filter((brief) => brief.to !== '*')

    expect(mine).toHaveLength(1)
    expect(mine[0]?.to).toBe(wearer)
    expect(mine[0]?.detail).toContain('Run!')
  })
})
