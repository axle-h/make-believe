import { describe, expect, it } from 'vitest'
import { MAX_LEVEL } from './constants.js'
import { grownup, grownupLadder, grownupTasks, isDaddy, obeyGrownup } from './grownup.js'
import { applyMessage } from './apply.js'
import { askFor, restartLadder, stepObjectives } from './objectives/director.js'
import { TEMPLATES } from './objectives/registry.js'
import { activePlayers } from './selectors.js'
import { createGame, type GameState } from './state.js'
import { joinPlayer } from './testRoom.js'

/**
 * A blob called Daddy gets the debug menu on its phone. The host grants the
 * privilege and the phone never claims it, which is the whole of what makes it
 * safe — and the word itself lives in the host, so it never ships to a phone.
 */

/** How many rows of the sheet this room could actually play. */
function playable(state: GameState): number {
  return grownupTasks(state).filter((task) => task.playable).length
}

function room(names: string[]): GameState {
  const state = createGame(1)
  for (const [index, name] of names.entries()) joinPlayer(state, `p${index + 1}`, name)
  return state
}

describe('who the grown-up is', () => {
  it('is whoever called their blob Daddy, in a hurry or otherwise', () => {
    expect(isDaddy('Daddy')).toBe(true)
    expect(isDaddy('daddy')).toBe(true)
    expect(isDaddy('DADDY')).toBe(true)
    expect(isDaddy(' Daddy ')).toBe(true)
  })

  it('is nobody else at all', () => {
    expect(isDaddy('Dad')).toBe(false)
    expect(isDaddy('Wilf')).toBe(false)
    expect(isDaddy('')).toBe(false)
  })

  /** Five characters is exactly the cap, so it fits with nothing to spare. */
  it('is a name a phone can actually type', () => {
    expect(isDaddy('Daddy')).toBe(true)
    expect('Daddy'.length).toBe(5)
  })

  it('is the one blob with the name, and nobody when nobody has it', () => {
    expect(grownup(room(['Wilf', 'Daddy', 'Ida']))?.name).toBe('Daddy')
    expect(grownup(room(['Wilf', 'Ida']))).toBeUndefined()
  })

  /** A phone that has gone quiet has no sheet to send anything to. */
  it('is nobody while their phone is away', () => {
    const state = room(['Wilf', 'Daddy'])
    applyMessage(state, { type: 'left', playerId: 'p2' })

    expect(grownup(state)).toBeUndefined()
  })
})

describe('the sheet', () => {
  it('lists every task there is, by the name a grown-up would recognise', () => {
    const tasks = grownupTasks(room(['Wilf', 'Daddy']))

    expect(tasks).toHaveLength(TEMPLATES.length)
    expect(tasks.map((task) => task.kind)).toEqual(TEMPLATES.map((template) => template.kind))
    for (const task of tasks) expect(task.title.length).toBeGreaterThan(0)
  })

  /**
   * A greyed row the TV would have accepted, or a live row it refuses, is a
   * menu that lies. `askFor` checks a headcount and deliberately not `suits`,
   * so this has to agree with it exactly — at every room size, for every task.
   */
  it('greys exactly the rows the TV would refuse', () => {
    for (let size = 2; size <= 10; size += 1) {
      const state = room(Array.from({ length: size }, (_, at) => `B${at}`))
      for (const task of grownupTasks(state)) {
        const fresh = room(Array.from({ length: size }, (_, at) => `B${at}`))
        expect(askFor(fresh, task.kind as never)).toBe(task.playable)
      }
    }
  })

  it('says where the ladder has got to', () => {
    const state = room(['Wilf', 'Daddy'])
    state.objectives.level = 4
    state.objectives.score = 70

    expect(grownupLadder(state)).toEqual({ level: 4, maxLevel: MAX_LEVEL, score: 70 })
  })

  it('changes as the room does, which is why it is re-sent', () => {
    const small = room(['Wilf', 'Daddy'])
    const big = room(['Wilf', 'Daddy', 'Ida', 'Bo'])

    expect(activePlayers(big).length).toBe(4)
    expect(playable(big)).toBeGreaterThan(playable(small))
  })
})

/**
 * A command from anybody else does nothing at all. The relay tags what a phone
 * says with the id its *socket* arrived under, so a phone cannot claim to be
 * Daddy — and this checks the name anyway, because the phone decides nothing.
 */
describe('who may ask', () => {
  it('does what the grown-up asked', () => {
    const state = room(['Wilf', 'Daddy'])

    expect(
      obeyGrownup(state, { type: 'command', playerId: 'p2', command: 'task', kind: 'sumo' }),
    ).toBe(true)
    expect(state.objectives.current?.kind).toBe('sumo')
  })

  it('does nothing for a blob the host did not name Daddy', () => {
    const state = room(['Wilf', 'Daddy'])

    expect(
      obeyGrownup(state, { type: 'command', playerId: 'p1', command: 'task', kind: 'sumo' }),
    ).toBe(false)
    expect(state.objectives.current).toBeNull()
  })

  it('does nothing for a blob that is not here at all', () => {
    const state = room(['Wilf', 'Daddy'])

    expect(obeyGrownup(state, { type: 'command', playerId: 'nobody', command: 'restart' })).toBe(
      false,
    )
  })

  it('does nothing for a restart asked for by somebody else', () => {
    const state = room(['Wilf', 'Daddy'])
    state.objectives.level = 5

    expect(obeyGrownup(state, { type: 'command', playerId: 'p1', command: 'restart' })).toBe(false)
    expect(state.objectives.level).toBe(5)
  })

  /** A kind nobody has ever heard of is a shrug, not a crash. */
  it('does nothing for a task that does not exist', () => {
    const state = room(['Wilf', 'Daddy'])

    expect(
      obeyGrownup(state, { type: 'command', playerId: 'p2', command: 'task', kind: 'juggling' }),
    ).toBe(false)
    expect(state.objectives.current).toBeNull()
  })

  /** And one this room is too small for is refused, exactly as `askFor` does. */
  it('does nothing for a task the room is too small for', () => {
    const state = room(['Daddy'])

    expect(
      obeyGrownup(state, { type: 'command', playerId: 'p1', command: 'task', kind: 'sumo' }),
    ).toBe(false)
    expect(state.objectives.current).toBeNull()
  })
})

/**
 * The two things the sheet can do. Both are the ones the TV's `d` key already
 * calls, and both do exactly what the director does to itself.
 */
describe('what a grown-up can ask for', () => {
  it('puts any task up, wherever the ladder is', () => {
    const state = room(['Wilf', 'Daddy'])
    expect(state.objectives.level).toBe(1)

    expect(askFor(state, 'keepTheCrown')).toBe(true)
    expect(state.objectives.current?.kind).toBe('keepTheCrown')
  })

  it('puts the ladder and the score back to the beginning', () => {
    const state = room(['Wilf', 'Daddy'])
    state.objectives.level = 6
    state.objectives.score = 180
    state.objectives.streak = 2
    state.objectives.pending = ['sumo']

    restartLadder(state)

    expect(state.objectives.level).toBe(1)
    expect(state.objectives.score).toBe(0)
    expect(state.objectives.streak).toBe(0)
    expect(state.objectives.pending).toEqual([])
  })

  /** There is no level 0: the ladder starts at 1, and so does starting again. */
  it('leaves the world running rather than emptying it', () => {
    const state = room(['Wilf', 'Daddy'])
    stepObjectives(state, 16)
    const running = state.objectives.current

    restartLadder(state)

    expect(state.objectives.current).toBe(running)
    expect(state.objectives.level).toBe(1)
  })

  /**
   * The crown is a title somebody won, not a number on the ladder. Starting
   * again does not take it off their head.
   */
  it('leaves the crown where it is', () => {
    const state = room(['Wilf', 'Daddy'])
    state.objectives.crown = 'p1'

    restartLadder(state)

    expect(state.objectives.crown).toBe('p1')
  })
})
