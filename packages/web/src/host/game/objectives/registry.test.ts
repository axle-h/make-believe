import { MAX_DETAIL_LENGTH, MAX_HEADLINE_LENGTH } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { BLOB_SIZE, MAX_LEVEL, PALETTE } from '../constants.js'
import { createRng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import { createGame, type GameState } from '../state.js'
import { contains, radiusFor, roofHeight } from '../zones.js'
import { eligibleTemplates, templateFor, TEMPLATES, unlockedAt } from './registry.js'
import type { ObjectiveTemplate } from './types.js'
import { joinPlayer } from '../testRoom.js'

// What must hold of every task; a new one inherits all of it by being in `TEMPLATES`.

function room(count: number, seed = 1): GameState {
  const state = createGame(seed)
  for (let index = 1; index <= count; index++) {
    joinPlayer(state, `p${index}`, `B${index}`)
  }
  return state
}

/** Tasks whose pad must hold the whole room at once; one that gathers everybody adds its kind here. */
const GATHERS_EVERYBODY = new Set<string>(['followTheChain', 'movingPad'])

function generate(template: ObjectiveTemplate, state: GameState, level: number, seed: number) {
  return template.generate({
    id: 'obj-1',
    world: state.world,
    rng: createRng(seed),
    level,
    players: activePlayers(state),
    crown: null,
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

  it('gives every one of them a name a grown-up can pick out of a list', () => {
    const titles = TEMPLATES.map((template) => template.title)

    for (const title of titles) expect(title.length).toBeGreaterThan(0)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('never lets a task quietly become unaskable', () => {
    for (const template of TEMPLATES) {
      const suits = template.suits
      if (!suits) continue
      const rooms = Array.from({ length: 16 }, (_, at) => at + 1).filter(
        (present) => present >= template.minPlayers,
      )
      expect(rooms.some((present) => suits(present))).toBe(true)
    }
  })

  it('unlocks every one of them somewhere on the ladder', () => {
    for (const template of TEMPLATES) {
      expect(template.minLevel).toBeGreaterThanOrEqual(1)
      expect(template.minLevel).toBeLessThanOrEqual(MAX_LEVEL)
      expect(template.minPlayers).toBeGreaterThanOrEqual(2)
    }
  })
})

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
            // Per axis, since a start pad is a tall thin rectangle.
            for (const zone of objective.zones) {
              const across = zone.shape === 'circle' ? zone.radius : zone.width / 2
              const down = zone.shape === 'circle' ? zone.radius : zone.height / 2
              const up = down + (zone.shape === 'house' ? roofHeight(zone) : 0)
              expect(zone.x - across).toBeGreaterThanOrEqual(0)
              expect(zone.y - up).toBeGreaterThanOrEqual(0)
              expect(zone.x + across).toBeLessThanOrEqual(state.world.width)
              expect(zone.y + down).toBeLessThanOrEqual(state.world.height)
            }
            expect(new Set(objective.zones.map((zone) => zone.id)).size).toBe(objective.zones.length)

            // Never a wall that shuts half the floor off.
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

      it('puts down a pad the whole room fits on, where the room is asked onto one', () => {
        if (!GATHERS_EVERYBODY.has(template.kind)) return
        for (let level = 1; level <= MAX_LEVEL; level++) {
          for (let present = template.minPlayers; present <= PALETTE.length; present++) {
            for (let seed = 0; seed < 6; seed++) {
              const state = room(present, seed)
              const objective = generate(template, state, level, seed)
              for (const zone of objective.zones) {
                if (zone.shape !== 'circle') continue
                expect(zone.radius).toBeGreaterThanOrEqual(radiusFor(present, 1))
              }
            }
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

          // The TV is the primary signal: exactly one line for the room, always.
          expect(briefs.filter((brief) => brief.to === '*')).toHaveLength(1)
          for (const brief of briefs) {
            expect(brief.to === '*' || here.has(brief.to)).toBe(true)
            expect(brief.headline.length).toBeLessThanOrEqual(MAX_HEADLINE_LENGTH)
            expect(brief.detail?.length ?? 0).toBeLessThanOrEqual(MAX_DETAIL_LENGTH)
          }
          expect(new Set(briefs.map((brief) => brief.to)).size).toBe(briefs.length)
        }
      })

      /** The clock is the director's, so a task's own step never ends it for an idle room. */
      it('is still running after a while of nobody doing anything about it', () => {
        const state = room(template.minPlayers + 1)
        const objective = generate(template, state, 3, 8)
        for (const player of activePlayers(state)) {
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
