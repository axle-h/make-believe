import { MAX_DETAIL_LENGTH, MAX_HEADLINE_LENGTH } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { applyMessage } from '../apply.js'
import { BLOB_SIZE, MAX_LEVEL } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { contains } from '../zones.js'
import { eligibleTemplates, templateFor, TEMPLATES, unlockedAt } from './registry.js'
import type { ObjectiveTemplate } from './types.js'

/**
 * What every task has to be true of, whatever it is. The catalogue is meant to
 * grow — a file and a line in the registry — so the rules that hold for all of
 * them are worth asserting once here rather than remembering each time.
 */

function room(count: number, seed = 1): GameState {
  const state = createGame(seed)
  for (let index = 1; index <= count; index++) {
    applyMessage(state, { type: 'join', playerId: `p${index}`, name: `B${index}` })
  }
  return state
}

function generate(template: ObjectiveTemplate, state: GameState, level: number, seed: number) {
  return template.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
  })
}

describe('the catalogue', () => {
  it('has one template per kind, and can find each of them', () => {
    const kinds = TEMPLATES.map((template) => template.kind)

    expect(new Set(kinds).size).toBe(kinds.length)
    for (const kind of kinds) expect(templateFor(kind).kind).toBe(kind)
  })

  it('starts a brand new room on something it can actually do', () => {
    const first = eligibleTemplates(1, 2)

    expect(first.length).toBeGreaterThan(0)
    for (const template of first) expect(template.minPlayers).toBeLessThanOrEqual(2)
  })

  /** The debug menu lists them by name, and an unnamed task is a blank row. */
  it('gives every one of them a name a grown-up can pick out of a list', () => {
    const titles = TEMPLATES.map((template) => template.title)

    for (const title of titles) expect(title.length).toBeGreaterThan(0)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('unlocks every one of them somewhere on the ladder', () => {
    for (const template of TEMPLATES) {
      expect(template.minLevel).toBeGreaterThanOrEqual(1)
      expect(template.minLevel).toBeLessThanOrEqual(MAX_LEVEL)
      // Nothing is for one blob on its own: this is a game for a room.
      expect(template.minPlayers).toBeGreaterThanOrEqual(2)
    }
  })
})

/**
 * Going up a rung asks the room for whatever that rung unlocked, before
 * anything else. That only works if every task is on exactly one rung.
 */
describe('what each rung of the ladder unlocks', () => {
  it('hands every task out exactly once, across the whole ladder', () => {
    const unlocked = Array.from({ length: MAX_LEVEL }, (_, at) => unlockedAt(at + 1)).flat()

    expect(new Set(unlocked).size).toBe(unlocked.length)
    expect(new Set(unlocked)).toEqual(new Set(TEMPLATES.map((template) => template.kind)))
  })

  it('has something new on the first rung, so a new room is never stuck', () => {
    expect(unlockedAt(1).length).toBeGreaterThan(0)
  })

  it('says nothing about a rung nobody can reach', () => {
    expect(unlockedAt(0)).toEqual([])
    expect(unlockedAt(MAX_LEVEL + 1)).toEqual([])
  })
})

describe('every task, at every level, in every size of room', () => {
  for (const template of TEMPLATES) {
    describe(template.kind, () => {
      it('puts everything it draws inside the world', () => {
        for (let level = 1; level <= MAX_LEVEL; level++) {
          for (let seed = 0; seed < 12; seed++) {
            const state = room(template.minPlayers + (seed % 5), seed)
            const objective = generate(template, state, level, seed)
            for (const zone of objective.zones) {
              const reach = zone.shape === 'circle' ? zone.radius : Math.max(zone.width, zone.height) / 2
              expect(zone.x - reach).toBeGreaterThanOrEqual(0)
              expect(zone.y - reach).toBeGreaterThanOrEqual(0)
              expect(zone.x + reach).toBeLessThanOrEqual(state.world.width)
              expect(zone.y + reach).toBeLessThanOrEqual(state.world.height)
            }
            expect(new Set(objective.zones.map((zone) => zone.id)).size).toBe(objective.zones.length)

            // Walls too, and never one that shuts half the floor off: a blob
            // that cannot drive round it is a blob out of the game.
            for (const wall of objective.obstacles) {
              expect(wall.x - wall.width / 2).toBeGreaterThanOrEqual(0)
              expect(wall.y - wall.height / 2).toBeGreaterThanOrEqual(0)
              expect(wall.x + wall.width / 2).toBeLessThanOrEqual(state.world.width)
              expect(wall.y + wall.height / 2).toBeLessThanOrEqual(state.world.height)
              expect(state.world.width - wall.width).toBeGreaterThan(BLOB_SIZE * 2)
              expect(state.world.height - wall.height).toBeGreaterThan(BLOB_SIZE * 2)
            }
            expect(new Set(objective.obstacles.map((wall) => wall.id)).size).toBe(
              objective.obstacles.length,
            )

            // Whatever it has put on the floor has to be reachable too: a
            // parcel half off the screen is one nobody can be driven into.
            for (const thing of objective.carryables) {
              expect(thing.x).toBeGreaterThan(0)
              expect(thing.y).toBeGreaterThan(0)
              expect(thing.x).toBeLessThan(state.world.width)
              expect(thing.y).toBeLessThan(state.world.height)
              expect(thing.home).toBeNull()
            }
            expect(new Set(objective.carryables.map((thing) => thing.id)).size).toBe(
              objective.carryables.length,
            )
          }
        }
      })

      it('starts running, with a clock and nothing said about how it went', () => {
        const state = room(template.minPlayers + 2)
        const objective = generate(template, state, 1, 5)

        expect(objective.outcome).toBe('running')
        expect(objective.note).toBeNull()
        expect(objective.totalMs).toBeGreaterThan(0)
        expect(objective.remainingMs).toBe(objective.totalMs)
      })

      it('says what it wants in words that fit on a phone', () => {
        for (let level = 1; level <= MAX_LEVEL; level++) {
          const state = room(template.minPlayers + 2, level)
          const objective = generate(template, state, level, level)
          const here = new Set(activePlayers(state).map((player) => player.playerId))
          const briefs = template.briefs(objective, state)

          // Every task tells the room something: the TV has one line, always.
          expect(briefs.filter((brief) => brief.to === '*')).toHaveLength(1)
          for (const brief of briefs) {
            expect(brief.to === '*' || here.has(brief.to)).toBe(true)
            expect(brief.headline.length).toBeLessThanOrEqual(MAX_HEADLINE_LENGTH)
            expect(brief.detail?.length ?? 0).toBeLessThanOrEqual(MAX_DETAIL_LENGTH)
          }
          // Nobody is told two different things at once.
          expect(new Set(briefs.map((brief) => brief.to)).size).toBe(briefs.length)
        }
      })

      /**
       * A room that stands still and does nothing must never be stuck: the
       * clock is the director's, so a task's own step has to leave it running
       * rather than declaring anything.
       */
      it('is still running after a while of nobody doing anything about it', () => {
        const state = room(template.minPlayers + 1)
        const objective = generate(template, state, 3, 8)
        for (const player of activePlayers(state)) {
          // Somewhere that is nowhere in particular.
          player.x = 40
          player.y = 40
        }
        const parked = objective.zones.some((zone) => contains(zone, 40, 40))

        for (let elapsed = 0; elapsed < 10_000; elapsed += 100) template.step(objective, state, 100)

        if (!parked) expect(objective.outcome).toBe('running')
      })
    })
  }
})
