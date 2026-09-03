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
import { eligibleTemplates, suitsRoom, templateFor, unlockedAt } from './registry.js'
import type { Brief, Objective, ObjectiveTemplate } from './types.js'

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
   * How long the running task has gone on not suiting the room. A task is
   * dropped once it has stopped suiting the room for good rather than for a
   * frame, so that a phone flickering out of wifi does not take one down.
   */
  unsuitableMs: number
  /**
   * What was played last, so the next one is something else where there is
   * anything else to play. Three goes at the same task in a row reads as a
   * broken game long before it reads as bad luck.
   */
  lastKind: Objective['kind'] | null
  /**
   * The level the room has just reached, while the cheer for it is still up,
   * and `null` the rest of the time. It is the one thing the TV says all
   * evening that is about the children rather than about the game.
   */
  levelledUpTo: number | null
  /**
   * Tasks that have only just been unlocked and have not been played yet. The
   * next thing the world asks for comes off here first, because a level that
   * unlocks something and then asks for the same old spot is a level that has
   * not visibly done anything.
   *
   * One that the room is currently too small for waits its turn rather than
   * being thrown away: it gets played the moment another blob turns up.
   */
  pending: Objective['kind'][]
  /**
   * Who is wearing the crown, between one task and the next.
   *
   * It is the only thing in the game that outlives the task that put it there.
   * A badge that lasts thirty seconds is much like any other badge; one that
   * is still on somebody's head two games later is a title, and taking it off
   * them is worth doing. It is cleared when its wearer finishes with their
   * blob or is forgotten for good, and by nothing else.
   */
  crown: string | null
  /** The last thing each phone was told, so only changes go on the wire. */
  announced: Brief[]
}

/**
 * Cheerful either way: the youngest player is three and nobody is ever losing.
 *
 * There are a lot of them because the room hears one every half a minute all
 * evening, and the joke is in the ones that only come round now and again.
 * They are all short, all sayable out loud, and not one of them is about how
 * well anybody did.
 */
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

/**
 * And when the clock beats them. Not one of these says anybody failed — the
 * time ran out, which is a thing that happens to a clock, not to a child.
 */
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
    unsuitableMs: 0,
    lastKind: null,
    levelledUpTo: null,
    pending: [],
    crown: null,
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

/**
 * A blob the world has finished with — quit, or away so long it has been
 * forgotten. If it was wearing the crown, the crown is nobody's until the next
 * game for it: a title held by a blob that is not on the floor is not a thing
 * anybody can take back.
 */
export function forgetPlayer(state: GameState, playerId: string): void {
  if (state.objectives.crown === playerId) state.objectives.crown = null
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

  // Whatever has just been unlocked goes first, so that going up a level is
  // something the room can see rather than a number in the corner.
  const unlocked = takePending(director, eligible)
  if (unlocked) {
    begin(state, unlocked, present)
    return
  }

  // Anything but the one they have just done, unless that is all there is.
  const fresh = eligible.filter((template) => template.kind !== director.lastKind)
  begin(state, pick(director.rng, fresh.length > 0 ? fresh : eligible), present)
}

/**
 * The first newly-unlocked task the room can actually do, taken off the queue.
 * One that needs more blobs than are here stays on it and gets its turn when
 * somebody else arrives — a new task nobody ever saw is a level that did
 * nothing.
 */
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

/** Put one particular task up, now. */
function begin(state: GameState, template: ObjectiveTemplate<Objective>, present: Player[]): void {
  const director = state.objectives
  // Whatever the last one had to say has been said; the screen is the new
  // task's from here.
  director.levelledUpTo = null
  director.made += 1
  director.lastKind = template.kind
  director.unsuitableMs = 0
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
 * Ask the world for one particular task, whatever the ladder would have
 * picked. Nothing in the game calls this and no phone can reach it: it is
 * there for the debug menu on the TV, which is a grown-up holding a keyboard
 * and wanting to see the twelfth task without playing up to it first.
 *
 * `false` means there are not enough blobs in the room for that one, which is
 * a thing to say rather than a thing to force: a task judged against two
 * children when it needs three is a task nobody can finish.
 *
 * It checks the headcount and deliberately not `suits`: a grown-up who wants
 * to look at two-to-a-pad with five blobs should get to look at it, even
 * though the room cannot finish it. The director itself checks both.
 */
export function askFor(state: GameState, kind: Objective['kind']): boolean {
  const template = templateFor(kind)
  const present = activePlayers(state)
  if (present.length < template.minPlayers) return false
  begin(state, template, present)
  return true
}

/**
 * Move the ladder by hand, for the same debug menu. It is clamped to the ladder
 * the room could have climbed to, and — unlike everything the game itself does
 * — it is allowed to go down, because somebody checking what a task looks like
 * at level 1 should not have to restart the TV to get back.
 */
export function setLevel(state: GameState, level: number): number {
  state.objectives.level = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))
  return state.objectives.level
}

/**
 * Back to the beginning: level 1 and nothing scored. It is the other half of
 * the grown-up's menu, and it is the only thing in the game that puts the
 * ladder *down* — the room itself only ever climbs.
 *
 * The crown is not part of the ladder and stays where it is: it is a title
 * somebody won, not a number this resets.
 */
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

  // The room has emptied out below what this task needs. Abandon it without a
  // word — a task nobody can finish is the world's problem, not the children's.
  const present = activePlayers(state).length
  if (present < template.minPlayers) {
    director.current = null
    return
  }

  // And the same for a room that has stopped suiting it: five blobs asked for
  // two to a pad is a sum that cannot come out. It has to stay that way for a
  // moment first, because a phone that blinks is not a child who left.
  director.unsuitableMs = suitsRoom(template, present) ? 0 : director.unsuitableMs + dtMs
  if (director.unsuitableMs >= UNSUITABLE_GRACE_MS) {
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
    levelUp(director)
  }
  // A task with something of its own to say about how it ended has already
  // said it — who was left holding the potato is better than "Brilliant!".
  objective.note ??= pick(director.rng, WELL_DONE)
  director.interludeMs = breather(director)
}

/**
 * Up a rung. The room is told so in as many words, and whatever that rung has
 * just unlocked is queued up to be the very next thing they are asked for.
 *
 * At the top of the ladder the level stops moving, so there is nothing to
 * announce and nothing new to queue: the world simply carries on being as hard
 * as it gets.
 */
function levelUp(director: Director): void {
  const before = director.level
  director.level = Math.min(MAX_LEVEL, director.level + 1)
  if (director.level === before) return
  director.levelledUpTo = director.level
  director.pending.push(...unlockedAt(director.level))
}

/**
 * Time ran out. Nothing goes down — not the score, not the level, not the
 * streak towards the next one. It simply ends and another appears.
 */
function expire(director: Director, objective: Objective): void {
  objective.note ??= pick(director.rng, NEVER_MIND)
  director.interludeMs = breather(director)
}

/** How long the room gets between tasks. A new level is worth a longer one. */
function breather(director: Director): number {
  return director.levelledUpTo === null ? INTERLUDE_MS : LEVEL_UP_INTERLUDE_MS
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
  if (objective.outcome !== 'running') return [breatherBrief(director, objective)]
  return templateFor(objective.kind).briefs(objective, state)
}

/**
 * What the room is told between one task and the next: how the last one went,
 * the level if they have just reached one, and — for the last few seconds — how
 * long until the next.
 *
 * A level takes the headline, because it is the bigger news and it is the one
 * line all evening that is about the children rather than about the game. What
 * the task had to say about itself drops to the second line and gives that up
 * in turn when the counting starts.
 */
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

/**
 * How long until the next one, for the last few seconds of the breather and
 * not before. It counts in whole seconds, which is both what a child can say
 * along with and what keeps this to one message a second on the wire.
 */
function countdown(director: Director): string | undefined {
  if (director.interludeMs > COUNTDOWN_MS) return undefined
  const seconds = Math.max(1, Math.ceil(director.interludeMs / 1000))
  return `Next game in ${seconds}s`
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

  // A phone that was being told something privately and no longer is gets the
  // line everybody else has, rather than being left holding a private half of
  // a task that has moved on without it. Taking its strip down instead would
  // leave one child staring at nothing while the room reads the banner: the
  // blob that has just had the crown taken off it is the case that found this.
  const shared = briefs.find((brief) => brief.to === '*')
  const stillAddressed = new Set(briefs.map((brief) => brief.to))
  const cleared: Brief[] = director.announced
    .filter((brief) => brief.to !== '*' && !stillAddressed.has(brief.to))
    .map((brief) => readdressed(shared, brief.to))

  director.announced = briefs
  return [...changed, ...cleared]
}

/** The room's line, said to one phone in particular. */
function readdressed(shared: Brief | undefined, to: Brief['to']): Brief {
  if (!shared) return { to, headline: '', tone: 'task' }
  return { ...shared, to }
}

/**
 * Two briefs are the same brief if they read the same — which includes which
 * word of the headline is painted, or a brief that changes only that would
 * never reach a phone.
 */
function wording(brief: Brief): string {
  return [brief.headline, brief.detail, brief.colour, brief.emphasis, brief.tone].join(' ')
}
