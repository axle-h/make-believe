/**
 * What the things being carried about actually are.
 *
 * The collecting games are the ones the room liked, and a parcel is a coloured
 * square. Apples in a basket, bones to the dog, socks to the washing: the same
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
  /** Where they go, for the headline: "basket". */
  home: string
  /** Drawn on the house, so that where they go needs no reading either. */
  homeGlyph: string
}

export const THEMES = [
  { things: 'apples', one: 'apple', glyph: '🍎', colour: '#ff5d5d', home: 'basket', homeGlyph: '🧺' },
  { things: 'bones', one: 'bone', glyph: '🦴', colour: '#f4f1ea', home: 'dog', homeGlyph: '🐶' },
  { things: 'fish', one: 'fish', glyph: '🐟', colour: '#4ea8ff', home: 'cat', homeGlyph: '🐱' },
  { things: 'socks', one: 'sock', glyph: '🧦', colour: '#c07bff', home: 'washing', homeGlyph: '🧺' },
  { things: 'letters', one: 'letter', glyph: '✉️', colour: '#f4f1ea', home: 'postbox', homeGlyph: '📮' },
  { things: 'eggs', one: 'egg', glyph: '🥚', colour: '#ffe08a', home: 'nest', homeGlyph: '🪹' },
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
  /** In order. Each is one carryable on the floor. */
  steps: readonly { glyph: string; colour: string }[]
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
    steps: [
      { glyph: '🔴', colour: '#ff5d5d' },
      { glyph: '🟡', colour: '#ffd23f' },
      { glyph: '🟢', colour: '#5ddf7f' },
    ],
  },
  {
    name: 'one two three',
    homeGlyph: '🔢',
    steps: [
      { glyph: '1️⃣', colour: '#4ea8ff' },
      { glyph: '2️⃣', colour: '#c07bff' },
      { glyph: '3️⃣', colour: '#3fe0d0' },
    ],
  },
] as const satisfies readonly Sequence[]
