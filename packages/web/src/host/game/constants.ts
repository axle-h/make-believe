/** World units are the 1280x720 pixels Phaser scales to fit the TV. */

export const WORLD_WIDTH = 1280
export const WORLD_HEIGHT = 720

export const BLOB_SIZE = 72

/** The blob's outline: a drawing is cropped to this before it is worn. */
export const BLOB_CORNER = 14

export const SPEED = 420

export const AWAY_TIMEOUT_MS = 30_000

export const BUBBLE_MS = 6_000

/** The names are said out loud to children who cannot read, so each must be a word a three-year-old owns. */
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

export const PALETTE: readonly string[] = BLOB_COLOURS.map((colour) => colour.hex)

/** One colour each, so the eleventh phone waits until somebody quits; the only queue in the game. */
export const MAX_BLOBS = BLOB_COLOURS.length

/** Hues the blob palette does not use, so a spot is never mistaken for a blob; named so a phone can say "yours is the blue one". */
export const ZONE_COLOURS = [
  { name: 'cream', hex: '#f6f0e2' },
  { name: 'blue', hex: '#8de0ff' },
  { name: 'yellow', hex: '#ffe08a' },
  { name: 'green', hex: '#b9ffb0' },
] as const

/** Lives here rather than in its task because the crown stays on between tasks. */
export const CROWN_BADGE = '👑'

export const LEVEL_UP_AFTER = 3

/** Score only ever goes up. */
export const SCORE_PER_OBJECTIVE = 10

/** The breather between tasks; not a gap in play, since every phone keeps every tool through it. */
export const INTERLUDE_MS = 8_000

/** Longer, so the level has the screen to itself before the countdown starts. */
export const LEVEL_UP_INTERLUDE_MS = 13_000

export const COUNTDOWN_MS = 5_000

/** How long a task must go on not suiting the room before it is dropped, so a wifi blip does not drop it. */
export const UNSUITABLE_GRACE_MS = 1_500

export const MAX_LEVEL = 8
