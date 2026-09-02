/**
 * The colours a child can paint with, and what to call them.
 *
 * Both ends need this list and they need to agree on it: the phone puts them
 * in a row under the drawing canvas, and the TV — asking a room to paint
 * themselves green — may only ask for a colour a phone can actually make.
 */

export interface Paint {
  /** What a grown-up would read out loud. One word, and no shades. */
  name: string
  hex: string
}

/** Dark first, which is the order they sit in on the phone. */
export const PAINTS = [
  { name: 'black', hex: '#10121a' },
  { name: 'white', hex: '#f4f1ea' },
  { name: 'red', hex: '#ff5d5d' },
  { name: 'blue', hex: '#4ea8ff' },
  { name: 'green', hex: '#5ddf7f' },
  { name: 'yellow', hex: '#ffd23f' },
  { name: 'purple', hex: '#c07bff' },
] as const satisfies readonly Paint[]

/** Just the colours, for the row of crayons on the phone. */
export const PAINT_HEXES: readonly string[] = PAINTS.map((paint) => paint.hex)

/**
 * The ones worth asking a whole room to cover themselves in. Black and white
 * are for eyes and teeth: a blob painted in either is hard to tell from one
 * that has been scribbled on, and being told your green is not green enough is
 * the one thing this game must never do.
 */
export const ASKABLE_PAINTS: readonly Paint[] = PAINTS.filter(
  (paint) => paint.name !== 'black' && paint.name !== 'white',
)
