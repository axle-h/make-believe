import type { ServerToHostMessage } from '@make-believe/shared'
import {
  COUNTDOWN_MS,
  INTERLUDE_MS,
  LEVEL_UP_AFTER,
  LEVEL_UP_INTERLUDE_MS,
  MAX_LEVEL,
  SCORE_PER_OBJECTIVE,
  UNSUITABLE_GRACE_MS,
} from '../constants.js'
import { createRng, pick, randomSeed, type Rng } from '../rng.js'
import { activePlayers } from '../selectors.js'
import type { GameState, Player } from '../state.js'
import {
  createCueLimiter,
  cueSnapshot,
  cuesFrom,
  rateLimit,
  type CueLimiter,
  type Sound,
} from './cues.js'
import { eligibleTemplates, suitsRoom, templateFor, unlockedAt } from './registry.js'
import type { Brief, Objective, ObjectiveTemplate } from './types.js'

export interface Director {
  level: number
  /** Only ever goes up, as `level` does; only a grown-up's menu takes either down. */
  score: number
  streak: number
  rng: Rng
  current: Objective | null
  interludeMs: number
  /** Only for ids. */
  made: number
  /** How long the running task has not suited the room; dropped at `UNSUITABLE_GRACE_MS`, so a blinking phone cannot end it. */
  unsuitableMs: number
  lastKind: Objective['kind'] | null
  /** Set while the cheer for a new level is up. */
  levelledUpTo: number | null
  /** Just-unlocked tasks, played before anything else. */
  pending: Objective['kind'][]
  /** Outlives the task that gave it; cleared only when its wearer is finished with or forgotten. */
  crown: string | null
  /** The last thing each phone was told, so only changes go on the wire. */
  announced: Brief[]
  elapsedMs: number
  cues: CueLimiter
  /** The last whole second counted out loud, so it is counted once. */
  counted: number | null
  /** Drained by `stepObjectives`. */
  sounds: Sound[]
}

/** Short, sayable out loud, and never about how well anybody did. */
const WELL_DONE = [
  'Brilliant!',
  'You did it!',
  'Nice one!',
  'Beautiful.',
  'Team blob!',
  'Blobtastic!',
  'Textbook.',
  'Look at you go!',
  'Absolutely blobulous.',
  'That was the good one.',
  'Smashing.',
  'Blobs of the year.',
  'Round of applause for the blobs.',
  'Ten out of blob.',
  'Marvellous stuff.',
  'You lot are unstoppable.',
  'Somebody write that down.',
  'Perfectly wobbled.',
  'Magnificent.',
  'The crowd goes mild.',
  'Very professional.',
  'A masterpiece.',
  'Blob squad, assemble!',
  'Nailed it.',
  'Squelchy perfection.',
  'Historic scenes.',
  'Give yourselves a wobble.',
  'Top blobbing.',
  'Frankly incredible.',
  'That is how it is done.',
] as const

/** Not one of these says anybody failed: the time ran out, which happens to a clock. */
const NEVER_MIND = [
  'Never mind — here comes another.',
  'Nearly! Try this one.',
  'That one got away. Next!',
  'Ooh, so close.',
  'The clock was cheating.',
  'Blobs need a rest. Here is another.',
  'We will say that one was practice.',
  'Almost! Try this instead.',
  'That one was too wriggly.',
  'Time flies when you are a blob.',
  'Nobody saw that. Next!',
  'Right, forget that ever happened.',
  'The floor was slippery.',
  'Bad luck, blobs.',
  'Not this time! Have another.',
  'Wobbled at the last moment.',
  'That one escaped. After it!',
  'Shall we pretend that counted?',
  'Whoops. Here comes the next.',
  'The clock won that one.',
] as const

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
    unsuitableMs: 0,
    lastKind: null,
    levelledUpTo: null,
    pending: [],
    crown: null,
    announced: [],
    elapsedMs: 0,
    cues: createCueLimiter(),
    counted: null,
    sounds: [],
  }
}

/** Only what is new since the last step, in both. */
export interface Announcements {
  briefs: Brief[]
  sounds: Sound[]
}

/** Runs after everyone has moved. */
export function stepObjectives(state: GameState, dtMs: number): Announcements {
  const director = state.objectives
  const objective = director.current
  director.elapsedMs += Math.max(0, dtMs)
  const before = cueSnapshot(objective)

  if (objective === null) startNext(state)
  else if (objective.outcome === 'running') run(state, objective, dtMs)
  else waitOutInterlude(director, dtMs)

  director.sounds.push(...cuesFrom(before, director.current))
  const sounds = rateLimit(director.cues, director.sounds, director.elapsedMs)
  director.sounds = []
  return { briefs: takeChangedBriefs(state), sounds }
}

/** Called after the message has already been applied to the world. */
export function observeMessage(state: GameState, message: ServerToHostMessage): void {
  const objective = state.objectives.current
  if (!objective || objective.outcome !== 'running') return
  templateFor(objective.kind).observe?.(objective, state, message)

  // A guess can end a task between frames, and the next step leaves an ended task alone.
  settle(state.objectives, objective)
}

/** For a phone that has just arrived and missed the announcement. */
export function briefFor(state: GameState, playerId: string): Brief | null {
  const briefs = currentBriefs(state)
  return briefs.find((brief) => brief.to === playerId) ?? briefs.find((brief) => brief.to === '*') ?? null
}

/** A crown held by a blob that is gone is nobody's until the next game for it. */
export function forgetPlayer(state: GameState, playerId: string): void {
  if (state.objectives.crown === playerId) state.objectives.crown = null
}

/** The TV's banner is the same line the phones get. */
export function banner(state: GameState): Brief | null {
  return currentBriefs(state).find((brief) => brief.to === '*') ?? null
}

function startNext(state: GameState): void {
  const director = state.objectives
  const present = activePlayers(state)
  // Gated by `minLevel` and by `suits`; with nothing eligible the world waits and tries next frame.
  const eligible = eligibleTemplates(director.level, present.length)
  if (eligible.length === 0) return

  const unlocked = takePending(director, eligible)
  if (unlocked) {
    begin(state, unlocked, present)
    return
  }

  // Never the same task twice running, unless it is the only one there is.
  const fresh = eligible.filter((template) => template.kind !== director.lastKind)
  begin(state, pick(director.rng, fresh.length > 0 ? fresh : eligible), present)
}

/** A queued task the room is too small for stays queued until another blob arrives, never dropped. */
function takePending(
  director: Director,
  eligible: ObjectiveTemplate<Objective>[],
): ObjectiveTemplate<Objective> | null {
  const at = director.pending.findIndex((kind) =>
    eligible.some((template) => template.kind === kind),
  )
  if (at === -1) return null
  const [kind] = director.pending.splice(at, 1)
  return eligible.find((template) => template.kind === kind) ?? null
}

function begin(state: GameState, template: ObjectiveTemplate<Objective>, present: Player[]): void {
  const director = state.objectives
  director.levelledUpTo = null
  director.made += 1
  director.lastKind = template.kind
  director.unsuitableMs = 0
  director.counted = null
  director.current = template.generate({
    id: `obj-${director.made}`,
    world: state.world,
    rng: director.rng,
    level: director.level,
    players: present,
    crown: director.crown,
  })
  director.interludeMs = 0
}

/**
 * For the grown-ups' menus only. `false` is too few blobs; it deliberately skips `suits` so a
 * grown-up can look at any task, while the director itself checks both.
 */
export function askFor(state: GameState, kind: Objective['kind']): boolean {
  const template = templateFor(kind)
  const present = activePlayers(state)
  if (present.length < template.minPlayers) return false
  begin(state, template, present)
  return true
}

/** For the grown-ups' menus, and so allowed to go down, which the game itself never does. */
export function setLevel(state: GameState, level: number): number {
  state.objectives.level = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))
  return state.objectives.level
}

/** The grown-up's restart. The crown is a title somebody won and is not reset. */
export function restartLadder(state: GameState): void {
  const director = state.objectives
  director.level = 1
  director.score = 0
  director.streak = 0
  director.pending = []
  director.levelledUpTo = null
}

function run(state: GameState, objective: Objective, dtMs: number): void {
  const director = state.objectives
  const template = templateFor(objective.kind)

  // Judged against whoever is present: a room emptied below the task drops it without a word.
  const present = activePlayers(state).length
  if (present < template.minPlayers) {
    director.current = null
    return
  }

  director.unsuitableMs = suitsRoom(template, present) ? 0 : director.unsuitableMs + dtMs
  if (director.unsuitableMs >= UNSUITABLE_GRACE_MS) {
    director.current = null
    return
  }

  if (objective.clock !== 'held') {
    objective.remainingMs = Math.max(0, objective.remainingMs - dtMs)
  }
  template.step(objective, state, dtMs)
  if (objective.outcome === 'running' && objective.remainingMs <= 0 && objective.clock !== 'held') {
    objective.outcome = 'expired'
  }

  settle(director, objective)
}

/** Called wherever a task can end: a step, or a guess between two frames. */
function settle(director: Director, objective: Objective): void {
  if (objective.outcome === 'done') complete(director, objective)
  else if (objective.outcome === 'expired') expire(director, objective)
}

function complete(director: Director, objective: Objective): void {
  director.sounds.push({ to: '*', cue: 'win' })
  director.score += SCORE_PER_OBJECTIVE
  director.streak += 1
  if (director.streak >= LEVEL_UP_AFTER) {
    director.streak = 0
    levelUp(director)
  }
  objective.note ??= pick(director.rng, WELL_DONE)
  director.interludeMs = breather(director)
}

function levelUp(director: Director): void {
  const before = director.level
  director.level = Math.min(MAX_LEVEL, director.level + 1)
  if (director.level === before) return
  director.levelledUpTo = director.level
  // The level takes the noise from the win, as it takes the headline.
  director.sounds = director.sounds.filter((sound) => !(sound.to === '*' && sound.cue === 'win'))
  director.sounds.push({ to: '*', cue: 'level' })
  // A climbed rung queues what it unlocked to be played next.
  director.pending.push(...unlockedAt(director.level))
}

/** Running out of time takes nothing away: not the score, the level or the streak. */
function expire(director: Director, objective: Objective): void {
  director.sounds.push({ to: '*', cue: 'miss' })
  objective.note ??= pick(director.rng, NEVER_MIND)
  director.interludeMs = breather(director)
}

/** Play carries on through the breather; a climbed rung earns a longer one. */
function breather(director: Director): number {
  return director.levelledUpTo === null ? INTERLUDE_MS : LEVEL_UP_INTERLUDE_MS
}

function waitOutInterlude(director: Director, dtMs: number): void {
  director.interludeMs -= dtMs
  if (director.interludeMs <= 0) director.current = null
}

function currentBriefs(state: GameState): Brief[] {
  const director = state.objectives
  const objective = director.current

  if (objective === null) {
    const eligible = eligibleTemplates(director.level, activePlayers(state).length)
    if (eligible.length > 0) return [{ to: '*', headline: '', tone: 'task' }]
    return [{ to: '*', headline: WAITING_HEADLINE, tone: 'task' }]
  }
  if (objective.outcome !== 'running') return [breatherBrief(director, objective)]
  return templateFor(objective.kind).briefs(objective, state)
}

/** A level takes the headline; the task's note drops to the detail and gives way to the countdown. */
function breatherBrief(director: Director, objective: Objective): Brief {
  const said = objective.note ?? ''
  const counting = countdown(director)

  if (director.levelledUpTo !== null) {
    return {
      to: '*',
      headline: `Level ${director.levelledUpTo}!`,
      detail: counting ?? said,
      tone: 'level',
    }
  }
  const brief: Brief = {
    to: '*',
    headline: said,
    tone: objective.outcome === 'done' ? 'win' : 'miss',
  }
  if (counting) brief.detail = counting
  return brief
}

/** Whole seconds, over the last `COUNTDOWN_MS` of the breather: one message a second, and sayable along. */
function countdown(director: Director): string | undefined {
  if (director.interludeMs > COUNTDOWN_MS) return undefined
  const seconds = Math.max(1, Math.ceil(director.interludeMs / 1000))
  if (director.counted !== seconds) {
    director.counted = seconds
    director.sounds.push({ to: '*', cue: 'count' })
  }
  return `Next game in ${seconds}s`
}

function takeChangedBriefs(state: GameState): Brief[] {
  const director = state.objectives
  const briefs = currentBriefs(state)
  const before = new Map(director.announced.map((brief) => [brief.to, wording(brief)]))
  const changed = briefs.filter((brief) => before.get(brief.to) !== wording(brief))

  // A phone no longer told anything privately gets the room's line, never an empty strip.
  const shared = briefs.find((brief) => brief.to === '*')
  const stillAddressed = new Set(briefs.map((brief) => brief.to))
  const cleared: Brief[] = director.announced
    .filter((brief) => brief.to !== '*' && !stillAddressed.has(brief.to))
    .map((brief) => readdressed(shared, brief.to))

  director.announced = briefs
  return [...changed, ...cleared]
}

function readdressed(shared: Brief | undefined, to: Brief['to']): Brief {
  if (!shared) return { to, headline: '', tone: 'task' }
  return { ...shared, to }
}

/** Includes `emphasis`, or a brief that changes only that would never reach a phone. */
function wording(brief: Brief): string {
  return [brief.headline, brief.detail, brief.colour, brief.emphasis, brief.tone].join(' ')
}
