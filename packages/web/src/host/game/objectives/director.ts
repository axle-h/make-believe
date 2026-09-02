import type { ServerToHostMessage } from '@make-believe/shared'
import { INTERLUDE_MS, LEVEL_UP_AFTER, MAX_LEVEL, SCORE_PER_OBJECTIVE } from '../constants.js'
import { createRng, pick, randomSeed, type Rng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState } from '../state.js'
import { eligibleTemplates, templateFor } from './registry.js'
import type { Brief, Objective } from './types.js'

/**
 * What the world is asking for, and who has been told. There is always exactly
 * one objective — finishing one makes the next — so there is no lobby, no
 * countdown to a start and no moment when a phone has nothing to do.
 *
 * Nothing in here can reach a phone except as words. A brief says what the
 * world wants; it never says what a phone may do, because the answer to that
 * is always "everything".
 */

export interface Director {
  level: number
  /** Only ever goes up. Running out of time is not losing. */
  score: number
  /** Completions since the last level up. */
  streak: number
  rng: Rng
  current: Objective | null
  /** Counts down while a finished objective is still on screen. */
  interludeMs: number
  /** How many objectives this world has made; ids and nothing else. */
  made: number
  /**
   * What was played last, so the next one is something else where there is
   * anything else to play. Three goes at the same task in a row reads as a
   * broken game long before it reads as bad luck.
   */
  lastKind: Objective['kind'] | null
  /** The last thing each phone was told, so only changes go on the wire. */
  announced: Brief[]
}

/** Cheerful either way: the youngest player is three and nobody is ever losing. */
const WELL_DONE = ['Brilliant!', 'You did it!', 'Nice one!', 'Beautiful.', 'Team blob!'] as const
const NEVER_MIND = [
  'Never mind — here comes another.',
  'Nearly! Try this one.',
  'That one got away. Next!',
] as const

/** What the phones are told while the room is too empty for anything to run. */
const WAITING_HEADLINE = 'Waiting for another blob…'

export function createDirector(seed: number = randomSeed()): Director {
  return {
    level: 1,
    score: 0,
    streak: 0,
    rng: createRng(seed),
    current: null,
    interludeMs: 0,
    made: 0,
    lastKind: null,
    announced: [],
  }
}

/**
 * One step of whatever the world is asking for, after everyone has moved.
 * Returns only the briefs whose wording has actually changed, which is what
 * keeps a countdown from becoming thirty messages a second.
 */
export function stepObjectives(state: GameState, dtMs: number): Brief[] {
  const director = state.objectives
  const objective = director.current

  if (objective === null) startNext(state)
  else if (objective.outcome === 'running') run(state, objective, dtMs)
  else waitOutInterlude(director, dtMs)

  return takeChangedBriefs(state)
}

/**
 * Something a phone said, offered to the running task. Talking and drawing are
 * tasks in their own right later on; until then nothing is listening, and the
 * message has already been applied to the world regardless.
 */
export function observeMessage(state: GameState, message: ServerToHostMessage): void {
  const objective = state.objectives.current
  if (!objective || objective.outcome !== 'running') return
  templateFor(objective.kind).observe?.(objective, state, message)

  // A guess can finish a task between two frames. Whatever ends it has to be
  // banked where it ends, because the next step sees a task that is already
  // over and quite reasonably leaves it alone.
  settle(state.objectives, objective)
}

/**
 * What one phone should currently be told, for a phone that has only just
 * arrived and missed the announcement. Its own line if the task has one for
 * it, otherwise the line everybody has.
 */
export function briefFor(state: GameState, playerId: string): Brief | null {
  const briefs = currentBriefs(state)
  return briefs.find((brief) => brief.to === playerId) ?? briefs.find((brief) => brief.to === '*') ?? null
}

/** The one line across the top of the TV, which is the same line the phones get. */
export function banner(state: GameState): Brief | null {
  return currentBriefs(state).find((brief) => brief.to === '*') ?? null
}

/** Make the next task, if there is one this room can do. */
function startNext(state: GameState): void {
  const director = state.objectives
  const present = activePlayers(state)
  const eligible = eligibleTemplates(director.level, present.length)
  // Nothing fits: the world waits, quietly, and tries again next frame. This is
  // not a failure and nobody is told off for it.
  if (eligible.length === 0) return

  // Anything but the one they have just done, unless that is all there is.
  const fresh = eligible.filter((template) => template.kind !== director.lastKind)
  const template = pick(director.rng, fresh.length > 0 ? fresh : eligible)

  director.made += 1
  director.lastKind = template.kind
  director.current = template.generate({
    id: `obj-${director.made}`,
    world: state.world,
    rng: director.rng,
    level: director.level,
    players: present,
  })
  director.interludeMs = 0
}

function run(state: GameState, objective: Objective, dtMs: number): void {
  const director = state.objectives
  const template = templateFor(objective.kind)

  // The room has emptied out below what this task needs. Abandon it without a
  // word — a task nobody can finish is the world's problem, not the children's.
  if (activePlayers(state).length < template.minPlayers) {
    director.current = null
    return
  }

  objective.remainingMs = Math.max(0, objective.remainingMs - dtMs)
  template.step(objective, state, dtMs)
  if (objective.outcome === 'running' && objective.remainingMs <= 0) objective.outcome = 'expired'

  settle(director, objective)
}

/**
 * A task that has ended, banked: the score, the cheer, and the moment it stays
 * on screen before the next one. Called wherever a task can end, which is both
 * the step that ran out of time and the guess that arrived between two frames.
 * A task still running is left alone.
 */
function settle(director: Director, objective: Objective): void {
  if (objective.outcome === 'done') complete(director, objective)
  else if (objective.outcome === 'expired') expire(director, objective)
}

/** They did it. Score goes up, and three in a row makes the world harder. */
function complete(director: Director, objective: Objective): void {
  director.score += SCORE_PER_OBJECTIVE
  director.streak += 1
  if (director.streak >= LEVEL_UP_AFTER) {
    director.streak = 0
    director.level = Math.min(MAX_LEVEL, director.level + 1)
  }
  // A task with something of its own to say about how it ended has already
  // said it — who was left holding the potato is better than "Brilliant!".
  objective.note ??= pick(director.rng, WELL_DONE)
  director.interludeMs = INTERLUDE_MS
}

/**
 * Time ran out. Nothing goes down — not the score, not the level, not the
 * streak towards the next one. It simply ends and another appears.
 */
function expire(director: Director, objective: Objective): void {
  objective.note ??= pick(director.rng, NEVER_MIND)
  director.interludeMs = INTERLUDE_MS
}

/** A finished task stays up a moment, then makes way for the next. */
function waitOutInterlude(director: Director, dtMs: number): void {
  director.interludeMs -= dtMs
  if (director.interludeMs <= 0) director.current = null
}

/** What every phone should be hearing right now, whether or not it has heard it. */
function currentBriefs(state: GameState): Brief[] {
  const director = state.objectives
  const objective = director.current

  if (objective === null) {
    const eligible = eligibleTemplates(director.level, activePlayers(state).length)
    // Between tasks there is nothing to say for a frame; only a room too empty
    // to run anything is worth a line, so that a lone blob knows why.
    if (eligible.length > 0) return [{ to: '*', headline: '', tone: 'task' }]
    return [{ to: '*', headline: WAITING_HEADLINE, tone: 'task' }]
  }
  if (objective.outcome !== 'running') {
    return [
      {
        to: '*',
        headline: objective.note ?? '',
        tone: objective.outcome === 'done' ? 'win' : 'miss',
      },
    ]
  }
  return templateFor(objective.kind).briefs(objective, state)
}

/**
 * The briefs that have changed since the last step. A phone is told a thing
 * once; a countdown that ticks in whole seconds therefore costs one message a
 * second rather than one a frame.
 */
function takeChangedBriefs(state: GameState): Brief[] {
  const director = state.objectives
  const briefs = currentBriefs(state)
  const before = new Map(director.announced.map((brief) => [brief.to, wording(brief)]))
  const changed = briefs.filter((brief) => before.get(brief.to) !== wording(brief))

  // A phone that was being told something privately and no longer is gets its
  // strip taken down, rather than being left holding a line about a task that
  // has finished.
  const stillAddressed = new Set(briefs.map((brief) => brief.to))
  const cleared: Brief[] = director.announced
    .filter((brief) => brief.to !== '*' && !stillAddressed.has(brief.to))
    .map((brief) => ({ to: brief.to, headline: '', tone: 'task' }))

  director.announced = briefs
  return [...changed, ...cleared]
}

/** Two briefs are the same brief if they read the same. */
function wording(brief: Brief): string {
  return `${brief.headline} ${brief.detail ?? ''} ${brief.colour ?? ''} ${brief.tone}`
}
