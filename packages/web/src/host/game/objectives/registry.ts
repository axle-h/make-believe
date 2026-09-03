import { colourHunt } from './colourHunt.js'
import { drawIt } from './drawIt.js'
import { fetch } from './fetch.js'
import { findYourColour } from './findYourColour.js'
import { followTheChain } from './followTheChain.js'
import { hotPotato } from './hotPotato.js'
import { keepTheCrown } from './keepTheCrown.js'
import { onTheSpot } from './onTheSpot.js'
import { pairs } from './pairs.js'
import { sorting } from './sorting.js'
import { sumo } from './sumo.js'
import { tooHeavyForOne } from './tooHeavyForOne.js'
import type { Objective, ObjectiveTemplate } from './types.js'

/**
 * Every kind of task there is, in the order they join the ladder. Adding one
 * is a file beside this and a line in the list.
 *
 * The list is typed against the whole `Objective` union. Each template is
 * written against its own kind, and TypeScript's bivariant method parameters
 * are what let both be true without a cast — see `ObjectiveTemplate`.
 */
export const TEMPLATES: readonly ObjectiveTemplate<Objective>[] = [
  onTheSpot,
  hotPotato,
  pairs,
  followTheChain,
  findYourColour,
  colourHunt,
  drawIt,
  fetch,
  sorting,
  tooHeavyForOne,
  sumo,
  keepTheCrown,
]

export function templateFor(kind: Objective['kind']): ObjectiveTemplate<Objective> {
  const template = TEMPLATES.find((candidate) => candidate.kind === kind)
  if (!template) throw new Error(`no objective template for ${kind}`)
  return template
}

/**
 * The same lookup for a string that arrived off the wire, where an unknown
 * kind is a thing to shrug at rather than to throw over. `shared` knows nothing
 * about objectives and must not start to, so a grown-up's phone sends a plain
 * string and this is what turns it back into a task.
 */
export function findTemplate(kind: string): ObjectiveTemplate<Objective> | null {
  return TEMPLATES.find((candidate) => candidate.kind === kind) ?? null
}

/**
 * The tasks that appear for the first time at this level — usually one, twice
 * two, and nothing at all at the levels that only make the old ones harder.
 *
 * The room plays whatever is on this list before anything else, because a
 * level that unlocks something and then asks for the same old spot is a level
 * that has not visibly done anything.
 */
export function unlockedAt(level: number): Objective['kind'][] {
  return TEMPLATES.filter((template) => template.minLevel === level).map(
    (template) => template.kind,
  )
}

/**
 * The tasks that could run right now: unlocked by the level, with enough blobs
 * present to mean anything, and — for the ones that are fussier than a
 * headcount — suiting a room this size. An empty list is the world quietly
 * waiting for another blob, which is not a failure of any kind.
 */
export function eligibleTemplates(level: number, present: number): ObjectiveTemplate<Objective>[] {
  return TEMPLATES.filter((template) => template.minLevel <= level && suitsRoom(template, present))
}

/**
 * Whether this room can be asked for this task at all. `askFor` deliberately
 * only checks the headcount half, so a grown-up can look at a task out of
 * order; everything the game does for itself checks both.
 */
export function suitsRoom(template: ObjectiveTemplate<Objective>, present: number): boolean {
  return template.minPlayers <= present && (template.suits?.(present) ?? true)
}
