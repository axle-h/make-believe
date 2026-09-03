import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { drawIt, type DrawItObjective } from './drawIt.js'
import { joinPlayer } from '../testRoom.js'

function room(count: number): GameState {
  const state = createGame(1)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

function make(state: GameState, level = 6, seed = 51): DrawItObjective {
  return drawIt.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
  })
}

/** Somebody says something out loud, exactly as the Say box sends it. */
function say(state: GameState, objective: DrawItObjective, playerId: string, value: string): void {
  applyMessage(state, { type: 'text', playerId, value })
  drawIt.observe?.(objective, state, { type: 'text', playerId, value })
}

/** Whoever is not holding the pencil. */
function guesserId(state: GameState, objective: DrawItObjective): string {
  const other = activePlayers(state).find((player) => player.playerId !== objective.artist)
  if (!other) throw new Error('expected somebody to guess')
  return other.playerId
}

describe('handing out the pencil', () => {
  it('gives it to somebody, and shows the room who has it', () => {
    const state = room(3)
    const objective = make(state)

    expect(objective.artist).toBeTruthy()
    expect(objective.marks).toEqual([{ playerId: objective.artist, badge: '✏️' }])
    expect(objective.word.length).toBeGreaterThan(2)
  })

  /** The word is on one phone. Half the room is looking at the TV. */
  it('never says the word on the television', () => {
    const state = room(3)
    const objective = make(state)
    const shared = drawIt.briefs(objective, state).find((brief) => brief.to === '*')

    expect(objective.headline).not.toContain(objective.word)
    expect(`${shared?.headline} ${shared?.detail}`).not.toContain(objective.word)
  })

  it('tells the artist what to draw, and nobody else', () => {
    const state = room(3)
    const objective = make(state)
    const briefs = drawIt.briefs(objective, state)
    const mine = briefs.find((brief) => brief.to === objective.artist)

    expect(mine?.headline).toBe(`Draw a ${objective.word}!`)
    expect(briefs.filter((brief) => brief.to !== '*')).toHaveLength(1)
  })
})

describe('guessing it', () => {
  it('is done the moment somebody says the word', () => {
    const state = room(3)
    const objective = make(state)
    const guesser = guesserId(state, objective)

    say(state, objective, guesser, `is it a ${objective.word}?`)

    expect(objective.outcome).toBe('done')
    expect(objective.guesser).toBe(guesser)
    expect(objective.note).toContain(objective.word)
    expect(objective.note).toContain(state.players.get(guesser)!.name)
  })

  it('is not done by anything else anybody says', () => {
    const state = room(3)
    const objective = make(state)

    say(state, objective, guesserId(state, objective), 'hello everybody')

    expect(objective.outcome).toBe('running')
    // ...and the saying still happened: a guess is a speech bubble like any other.
    expect(state.players.get(guesserId(state, objective))?.bubble?.text).toBe('hello everybody')
  })

  /** The one holding the pencil cannot claim it by typing the answer in. */
  it('does not let the artist guess their own word', () => {
    const state = room(3)
    const objective = make(state)

    say(state, objective, objective.artist!, objective.word)

    expect(objective.outcome).toBe('running')
  })

  it('is over once it is over, whatever else is said', () => {
    const state = room(3)
    const objective = make(state)
    const first = guesserId(state, objective)
    say(state, objective, first, objective.word)

    const other = activePlayers(state).find(
      (player) => player.playerId !== objective.artist && player.playerId !== first,
    )!
    say(state, objective, other.playerId, objective.word)

    expect(objective.guesser).toBe(first)
  })
})

describe('coming and going', () => {
  /**
   * A phone put down mid-drawing would leave a room guessing at a picture
   * nobody is drawing. The pencil is handed on, quietly, and the word with it.
   */
  it('hands the pencil to somebody else when the artist goes', () => {
    const state = room(3)
    const objective = make(state)
    const wasDrawing = objective.artist!
    applyMessage(state, { type: 'left', playerId: wasDrawing })

    drawIt.step(objective, state, 100)

    expect(objective.artist).not.toBe(wasDrawing)
    expect(objective.marks).toEqual([{ playerId: objective.artist, badge: '✏️' }])
    expect(drawIt.briefs(objective, state).some((brief) => brief.to === objective.artist)).toBe(true)
  })

  it('says what it was when nobody got it', () => {
    const state = room(2)
    const objective = make(state)
    objective.remainingMs = 0

    drawIt.step(objective, state, 100)

    expect(objective.note).toBe(`It was a ${objective.word}!`)
    // The director is what calls it expired; the task only supplies the words.
    expect(objective.outcome).toBe('running')
  })
})
