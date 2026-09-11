import { dodge } from './dodge.js'
import { drawIt } from './drawIt.js'
import { fetch } from './fetch.js'
import { findYourColour } from './findYourColour.js'
import { followTheChain } from './followTheChain.js'
import { hotPotato } from './hotPotato.js'
import { inOrder } from './inOrder.js'
import { movingPad } from './movingPad.js'
import { keepTheCrown } from './keepTheCrown.js'
import { onTheSpot } from './onTheSpot.js'
import { race } from './race.js'
import { pairs } from './pairs.js'
import { sorting } from './sorting.js'
import { sumo } from './sumo.js'
import { tooHeavyForOne } from './tooHeavyForOne.js'
import type { Objective, ObjectiveTemplate } from './types.js'

/** Every task, in the order they join the ladder. The five rules they obey are on `ObjectiveTemplate`. */
export const TEMPLATES: readonly ObjectiveTemplate<Objective>[] = [
  onTheSpot,
  race,
  hotPotato,
  movingPad,
  pairs,
  followTheChain,
  findYourColour,
  drawIt,
  fetch,
  sorting,
  inOrder,
  tooHeavyForOne,
  dodge,
  sumo,
  keepTheCrown,
]

export function templateFor(kind: Objective['kind']): ObjectiveTemplate<Objective> {
  const template = TEMPLATES.find((candidate) => candidate.kind === kind)
  if (!template) throw new Error(`no objective template for ${kind}`)
  return template
}

/** For a kind off the wire, which `shared` sends as a plain string: unknown is `null`, not a throw. */
export function findTemplate(kind: string): ObjectiveTemplate<Objective> | null {
  return TEMPLATES.find((candidate) => candidate.kind === kind) ?? null
}

export function unlockedAt(level: number): Objective['kind'][] {
  return TEMPLATES.filter((template) => template.minLevel === level).map(
    (template) => template.kind,
  )
}

/** An empty list is the world waiting for another blob, not a failure. */
export function eligibleTemplates(level: number, present: number): ObjectiveTemplate<Objective>[] {
  return TEMPLATES.filter((template) => template.minLevel <= level && suitsRoom(template, present))
}

/** `askFor` checks only the headcount so a grown-up can pick any task; the game itself checks both. */
export function suitsRoom(template: ObjectiveTemplate<Objective>, present: number): boolean {
  return template.minPlayers <= present && (template.suits?.(present) ?? true)
}
