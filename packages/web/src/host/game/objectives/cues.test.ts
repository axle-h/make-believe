import { describe, expect, it } from 'vitest'
import { COUNTDOWN_MS, INTERLUDE_MS, LEVEL_UP_AFTER } from '../constants.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { joinPlayer } from '../testRoom.js'
import {
  createCueLimiter,
  cueSnapshot,
  cuesFrom,
  rateLimit,
  CUE_GAP_MS,
  type Sound,
} from './cues.js'
import { askFor, stepObjectives } from './director.js'
import type { FetchObjective } from './fetch.js'
import type { Objective } from './types.js'

/**
 * A cue is a *difference*: what changed between one step and the next. Nothing
 * asks a task to report anything, which is why adding the thirteenth earns its
 * noises for free — and why nothing can repeat every frame by accident.
 */

function room(count: number): GameState {
  const state = createGame(3)
  for (let index = 1; index <= count; index++) joinPlayer(state, `p${index}`, `B${index}`)
  return state
}

/** Put a fetch task up and hand it over, with everything still on the floor. */
function fetching(state: GameState): FetchObjective {
  expect(askFor(state, 'fetch')).toBe(true)
  return state.objectives.current as FetchObjective
}

describe('what is worth a noise', () => {
  it('is nothing at all when nothing happened', () => {
    const state = room(2)
    const objective = fetching(state)

    expect(cuesFrom(cueSnapshot(objective), objective)).toEqual([])
  })

  it('is a pickup, for whoever picked it up', () => {
    const state = room(2)
    const objective = fetching(state)
    const before = cueSnapshot(objective)
    const parcel = objective.carryables[0]
    if (!parcel || parcel.kind !== 'parcel') throw new Error('expected a parcel')
    parcel.carriedBy = 'p1'

    expect(cuesFrom(before, objective)).toEqual([{ to: 'p1', cue: 'pickup' }])
  })

  /**
   * Arriving is what puts a parcel down, so by the time anybody looks nobody
   * is holding it. The cue goes to whoever was holding it a moment before.
   */
  it('is a delivery, for whoever was carrying it a moment ago', () => {
    const state = room(2)
    const objective = fetching(state)
    const parcel = objective.carryables[0]
    if (!parcel || parcel.kind !== 'parcel') throw new Error('expected a parcel')
    parcel.carriedBy = 'p2'
    const before = cueSnapshot(objective)
    parcel.carriedBy = null
    parcel.home = 'house'

    expect(cuesFrom(before, objective)).toEqual([{ to: 'p2', cue: 'deliver' }])
  })

  it('is one cue for a delivery, not one every frame afterwards', () => {
    const state = room(2)
    const objective = fetching(state)
    const parcel = objective.carryables[0]
    if (!parcel || parcel.kind !== 'parcel') throw new Error('expected a parcel')
    parcel.carriedBy = 'p1'
    parcel.home = 'house'
    const settled = cueSnapshot(objective)

    expect(cuesFrom(settled, objective)).toEqual([])
  })

  it('is a badge arriving, for whoever it landed on', () => {
    const state = room(3)
    expect(askFor(state, 'keepTheCrown')).toBe(true)
    const objective = state.objectives.current as Objective
    const before = cueSnapshot(objective)
    const next = activePlayers(state).find((player) => !before.marks.includes(player.playerId))
    if (!next) throw new Error('somebody should not be wearing it')
    objective.marks = [{ playerId: next.playerId, badge: '👑' }]

    expect(cuesFrom(before, objective)).toEqual([{ to: next.playerId, cue: 'mine' }])
  })

  it('is nothing when there is no task at all', () => {
    expect(cuesFrom(cueSnapshot(null), null)).toEqual([])
  })
})

/**
 * Six phones beeping at once is a lot, and a blob dragged through a heap of
 * parcels should not sound like a fire alarm.
 */
describe('how often one phone may beep', () => {
  it('lets the first through and holds the next for a quarter of a second', () => {
    const limiter = createCueLimiter()

    expect(rateLimit(limiter, [{ to: 'p1', cue: 'pickup' }], 0)).toHaveLength(1)
    expect(rateLimit(limiter, [{ to: 'p1', cue: 'pickup' }], CUE_GAP_MS - 1)).toHaveLength(0)
    expect(rateLimit(limiter, [{ to: 'p1', cue: 'pickup' }], CUE_GAP_MS)).toHaveLength(1)
  })

  it('holds one phone without holding another', () => {
    const limiter = createCueLimiter()
    rateLimit(limiter, [{ to: 'p1', cue: 'pickup' }], 0)

    const allowed = rateLimit(
      limiter,
      [
        { to: 'p1', cue: 'pickup' },
        { to: 'p2', cue: 'pickup' },
      ],
      10,
    )

    expect(allowed).toEqual([{ to: 'p2', cue: 'pickup' }])
  })

  it('drops the second of two cues to the same phone in one frame', () => {
    const limiter = createCueLimiter()

    const allowed = rateLimit(
      limiter,
      [
        { to: 'p1', cue: 'pickup' },
        { to: 'p1', cue: 'deliver' },
      ],
      0,
    )

    expect(allowed).toEqual([{ to: 'p1', cue: 'pickup' }])
  })
})

/** Put "everybody on the spot" up and actually solve it, as a room would. */
function standOnTheSpot(state: GameState): Sound[] {
  expect(askFor(state, 'onTheSpot')).toBe(true)
  const spot = state.objectives.current?.zones[0]
  if (!spot) throw new Error('expected a spot')
  for (const player of activePlayers(state)) {
    player.x = spot.x
    player.y = spot.y
  }
  const heard: Sound[] = []
  for (let step = 0; step < 200 && state.objectives.current?.outcome !== 'done'; step++) {
    heard.push(...stepObjectives(state, 100).sounds)
  }
  return heard
}

/** And the ones the director makes on its own account, out of `stepObjectives`. */
describe('the noises the world itself makes', () => {
  it('cheers for everybody when the room does it', () => {
    const heard = standOnTheSpot(room(2))

    expect(heard).toContainEqual({ to: '*', cue: 'win' })
  })

  it('shrugs for everybody when the clock beats them', () => {
    const state = room(2)
    const objective = fetching(state)
    objective.remainingMs = 0

    const { sounds } = stepObjectives(state, 16)

    expect(sounds).toContainEqual({ to: '*', cue: 'miss' })
  })

  /**
   * A rung takes the noise as well as the headline: it is the bigger news, and
   * a cheer and a fanfare in the same frame is one of them wasted.
   */
  it('makes one noise for everybody when the room goes up a rung', () => {
    const state = room(2)
    state.objectives.streak = LEVEL_UP_AFTER - 1

    const heard = standOnTheSpot(state)

    expect(state.objectives.level).toBe(2)
    expect(heard.filter((sound) => sound.cue === 'level')).toEqual([{ to: '*', cue: 'level' }])
    expect(heard).not.toContainEqual({ to: '*', cue: 'win' })
  })

  /** A number to say out loud together, and one blip to say each with. */
  it('counts the last few seconds out once each, not once a frame', () => {
    const state = room(2)
    const objective = fetching(state)
    objective.remainingMs = 0
    stepObjectives(state, 16)
    expect(state.objectives.interludeMs).toBe(INTERLUDE_MS)

    let counts = 0
    for (let elapsed = 0; elapsed < INTERLUDE_MS; elapsed += 100) {
      counts += stepObjectives(state, 100).sounds.filter((sound) => sound.cue === 'count').length
    }

    expect(counts).toBe(COUNTDOWN_MS / 1_000)
  })
})
