// What the carried things are. Data only: the TV picks and draws a theme, the phone paints its word.

export interface Theme {
  things: string
  /** Singular, because "every apples" is not a sentence. */
  one: string
  glyph: string
  /** Also the colour the headline paints `things` in. */
  colour: string
  home: string
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

// The house takes one step at a time, in order; a parcel brought out of turn is dropped where it
// stands rather than punished.
export interface Sequence {
  name: string
  homeGlyph: string
  /** One carryable each. `glyph` is optional because a traffic light is its colours. */
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
    // 🟡 and 🟢 are Emoji 12, which is a box on the TV.
    steps: [{ colour: '#ff5d5d' }, { colour: '#ffd23f' }, { colour: '#5ddf7f' }],
  },
  {
    name: 'one two three',
    homeGlyph: '🔢',
    steps: [
      { glyph: '1', colour: '#4ea8ff' },
      { glyph: '2', colour: '#c07bff' },
      { glyph: '3', colour: '#3fe0d0' },
    ],
  },
] as const satisfies readonly Sequence[]
