/**
 * What the things being carried about actually are.
 *
 * The collecting games are the ones the room liked, and a parcel is a coloured
 * square. Apples into a pie, bones to the dog, shirts to the wardrobe: the same
 * game, funnier, and — because the glyph is drawn on the thing and the word is
 * painted in the headline — a good deal easier to understand without reading.
 *
 * Both ends need this list: the TV picks a theme and draws it, and the phone
 * paints the word of the headline the TV named. It is data and nothing else.
 */

export interface Theme {
  /** What they are, plural, for the headline: "apples". */
  things: string
  /** And one of them, because "every apples" is not a sentence. */
  one: string
  /** Drawn over each one. One character that carries across a room. */
  glyph: string
  /** What colour they are, and the colour the headline paints their name in. */
  colour: string
  /** Where they go, for the headline: "pie". */
  home: string
  /** Drawn on the house, so that where they go needs no reading either. */
  homeGlyph: string
}

export const THEMES = [
  { things: 'apples', one: 'apple', glyph: '🍎', colour: '#ff5d5d', home: 'pie', homeGlyph: '🥧' },
  { things: 'bones', one: 'bone', glyph: '🍖', colour: '#f4f1ea', home: 'dog', homeGlyph: '🐶' },
  { things: 'fish', one: 'fish', glyph: '🐟', colour: '#4ea8ff', home: 'cat', homeGlyph: '🐱' },
  { things: 'shirts', one: 'shirt', glyph: '👕', colour: '#c07bff', home: 'wardrobe', homeGlyph: '🚪' },
  { things: 'letters', one: 'letter', glyph: '✉️', colour: '#f4f1ea', home: 'postbox', homeGlyph: '📮' },
  { things: 'eggs', one: 'egg', glyph: '🥚', colour: '#ffe08a', home: 'pan', homeGlyph: '🍳' },
  { things: 'presents', one: 'present', glyph: '🎁', colour: '#5ddf7f', home: 'sleigh', homeGlyph: '🛷' },
  { things: 'rubbish', one: 'bit of rubbish', glyph: '🍌', colour: '#ffd23f', home: 'bin', homeGlyph: '🗑️' },
] as const satisfies readonly Theme[]

/**
 * A thing that goes in a particular order: bread, cheese, bread.
 *
 * The house asks for one at a time and takes nothing else, which is the whole
 * of the rule — a parcel brought out of turn is dropped where it stands rather
 * than punished, because "not yet" is not the same as "wrong".
 */
export interface Sequence {
  /** What it is, for the headline: "sandwich". */
  name: string
  /** Drawn on the house, over whatever it is waiting for. */
  homeGlyph: string
  /**
   * In order. Each is one carryable on the floor.
   *
   * A step's `glyph` is optional because a traffic light *is* its colours: a
   * picture drawn on top of a red circle said nothing the circle did not.
   */
  steps: readonly { glyph?: string; colour: string }[]
}

export const SEQUENCES = [
  {
    name: 'sandwich',
    homeGlyph: '🍽️',
    steps: [
      { glyph: '🍞', colour: '#ffd23f' },
      { glyph: '🧀', colour: '#ffe08a' },
      { glyph: '🍞', colour: '#ffd23f' },
    ],
  },
  {
    name: 'traffic light',
    homeGlyph: '🚦',
    // No pictures on these at all: a traffic light is its colours, and 🟡 and
    // 🟢 are Emoji 12 — a tofu box on the television, which is what the third
    // play test saw.
    steps: [{ colour: '#ff5d5d' }, { colour: '#ffd23f' }, { colour: '#5ddf7f' }],
  },
  {
    name: 'one two three',
    homeGlyph: '🔢',
    // Plain digits rather than keycaps. 1️⃣ is three code points that render
    // inconsistently even where every part of them exists; '1' is not an emoji
    // at all, and the houses already have numerals written on them.
    steps: [
      { glyph: '1', colour: '#4ea8ff' },
      { glyph: '2', colour: '#c07bff' },
      { glyph: '3', colour: '#3fe0d0' },
    ],
  },
] as const satisfies readonly Sequence[]
