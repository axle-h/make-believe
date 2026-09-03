/**
 * The dimensions and pacing of the world. Everything here is in world units,
 * which are the 1280x720 pixels Phaser scales to fit the TV.
 */

export const WORLD_WIDTH = 1280
export const WORLD_HEIGHT = 720

/** A blob is a square of this side length, centred on its position. */
export const BLOB_SIZE = 72

/**
 * How rounded its corners are. It is the blob's outline as far as anything
 * else is concerned: a drawing is cropped to this shape before it is worn, so
 * a child who scribbles past the edge gets a blob rather than a square.
 */
export const BLOB_CORNER = 14

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

/**
 * Every colour a blob can be, and what to call each of them.
 *
 * The names are not decoration: a child picks their blob by one of these, and
 * a pad the colour of somebody's blob has to be sayable out loud on a phone
 * ("yours is the orange one") by whoever is sitting next to a four-year-old
 * who cannot read it.
 *
 * **Ten of them, and that is the ceiling.** Every one has to be a word a
 * three-year-old owns and a colour tellable from the other nine across a lit
 * room, which is most of why there is no eleventh — and since a colour each is
 * how a child picks a blob, ten colours is also a hard cap of ten blobs.
 */
export const BLOB_COLOURS = [
  { name: 'red', hex: '#ff5d5d' },
  { name: 'blue', hex: '#4ea8ff' },
  { name: 'green', hex: '#5ddf7f' },
  { name: 'yellow', hex: '#ffd23f' },
  { name: 'purple', hex: '#c07bff' },
  { name: 'orange', hex: '#ff8f3f' },
  { name: 'teal', hex: '#3fe0d0' },
  { name: 'pink', hex: '#ff6fc1' },
  { name: 'white', hex: '#ffffff' },
  { name: 'brown', hex: '#c68b59' },
] as const

/** Just the colours, which is all most of the model cares about. */
export const PALETTE: readonly string[] = BLOB_COLOURS.map((colour) => colour.hex)

/**
 * How many blobs there can be at once, which is exactly how many colours there
 * are. The eleventh phone waits with its name typed and gets in the moment
 * somebody quits: it is the only queue in the game, and it is a physical limit
 * rather than a round — no phone that is *in* ever waits for anything.
 */
export const MAX_BLOBS = BLOB_COLOURS.length

/**
 * The floor is dark, so a zone is drawn in something the blob palette does not
 * use. Nobody should ever have to work out whether a spot is somebody's blob.
 *
 * Each one is named as well as coloured, because a task that tells one phone
 * privately which pad is theirs has to say it in a word a four-year-old can be
 * read out loud: "yours is the blue one".
 */
export const ZONE_COLOURS = [
  // Cream rather than white, which is what #f6f0e2 actually is: a blob can be
  // white now, and two things a room has to tell apart may not share a name.
  { name: 'cream', hex: '#f6f0e2' },
  { name: 'blue', hex: '#8de0ff' },
  { name: 'yellow', hex: '#ffe08a' },
  { name: 'green', hex: '#b9ffb0' },
] as const

/**
 * The crown, worn beside the name of whoever holds it.
 *
 * It lives here rather than in the task that plays for it because it outlives
 * that task: a crown that lasts thirty seconds is a token, and one that stays
 * on somebody's head between games is a title.
 */
export const CROWN_BADGE = '👑'

/** How many objectives the room has to finish before the next one gets harder. */
export const LEVEL_UP_AFTER = 3

/** What finishing one is worth. Score only ever goes up. */
export const SCORE_PER_OBJECTIVE = 10

/**
 * How long a finished objective stays on screen, cheering or shrugging, before
 * the next one appears.
 *
 * It is not a gap in play — every phone can still drive, talk and draw right
 * through it — it is a breather, which six children going flat out for half a
 * minute at a time turn out to need. Long enough to read what happened, say
 * something about it, and see the next one coming.
 */
export const INTERLUDE_MS = 8_000

/**
 * And how long when the room has just gone up a level. The extra is for the
 * level itself, which gets the screen to itself before the countdown starts:
 * it is the only thing all evening that is about the children rather than
 * about the game, and it is worth a few seconds of everybody looking up.
 */
export const LEVEL_UP_INTERLUDE_MS = 13_000

/**
 * How much of a breather is spent counting down to the next task. A number
 * going 5, 4, 3 is a thing to say out loud together, and it means nobody is
 * left wondering whether the game has stopped.
 */
export const COUNTDOWN_MS = 5_000

/**
 * How long a task has to go on not suiting the room before it is dropped.
 *
 * A phone that goes quiet is marked away the moment it does, so a blip in the
 * wifi would otherwise flip a room of four odd and take "two to a pad" down
 * with it. A second or so of it is a room that has genuinely changed.
 */
export const UNSUITABLE_GRACE_MS = 1_500

/** The hardest the ladder goes. Beyond this the parameters stop tightening. */
export const MAX_LEVEL = 8
