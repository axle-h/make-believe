/**
 * The dimensions and pacing of the world. Everything here is in world units,
 * which are the 1280x720 pixels Phaser scales to fit the TV.
 */

export const WORLD_WIDTH = 1280
export const WORLD_HEIGHT = 720

/** A blob is a square of this side length, centred on its position. */
export const BLOB_SIZE = 72

/** Pixels per second at full deflection of a joystick. */
export const SPEED = 420

/**
 * How long a blob waits on screen for a phone that has gone. Long enough to
 * cover a refresh or a walk out of wifi range; short enough that a child who
 * puts the phone down does not clutter the TV all evening.
 */
export const AWAY_TIMEOUT_MS = 30_000

/**
 * How long a speech bubble stays up. Long enough for a grown-up to read a
 * sixty-character sentence out loud, short enough that the TV clears itself.
 */
export const BUBBLE_MS = 6_000

/** One colour per slot, in slot order. */
export const PALETTE = [
  '#ff5d5d',
  '#4ea8ff',
  '#5ddf7f',
  '#ffd23f',
  '#c07bff',
  '#ff8f3f',
  '#3fe0d0',
  '#ff6fc1',
] as const

/**
 * The floor is dark, so a zone is drawn in something the blob palette does not
 * use. Nobody should ever have to work out whether a spot is somebody's blob.
 *
 * Each one is named as well as coloured, because a task that tells one phone
 * privately which pad is theirs has to say it in a word a four-year-old can be
 * read out loud: "yours is the blue one".
 */
export const ZONE_COLOURS = [
  { name: 'white', hex: '#f6f0e2' },
  { name: 'blue', hex: '#8de0ff' },
  { name: 'yellow', hex: '#ffe08a' },
  { name: 'green', hex: '#b9ffb0' },
] as const

/** How many objectives the room has to finish before the next one gets harder. */
export const LEVEL_UP_AFTER = 3

/** What finishing one is worth. Score only ever goes up. */
export const SCORE_PER_OBJECTIVE = 10

/**
 * How long a finished objective stays on screen, cheering or shrugging, before
 * the next one appears. It is not a gap in play: every phone can still drive,
 * talk and draw right through it.
 */
export const INTERLUDE_MS = 4_000

/** The hardest the ladder goes. Beyond this the parameters stop tightening. */
export const MAX_LEVEL = 8
