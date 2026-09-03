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
 * The tasks that could run right now: unlocked by the level, and with enough
 * blobs present to mean anything. An empty list is the world quietly waiting
 * for another blob, which is not a failure of any kind.
 */
export function eligibleTemplates(level: number, present: number): ObjectiveTemplate<Objective>[] {
  return TEMPLATES.filter(
    (template) => template.minLevel <= level && template.minPlayers <= present,
  )
}
