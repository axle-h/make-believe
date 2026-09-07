/**
 * Every picture the game is allowed to draw.
 *
 * They are text characters in whatever emoji font the device has, and the
 * device is a stick behind a television running Android 9 — Emoji 11. A
 * picture the font has never heard of is a tofu box, which is worse than no
 * picture at all, so the vocabulary is capped at Emoji 5.0 (2017) and this
 * list is what holds it there. That is one whole Android release of headroom
 * below the oldest device we care about, and it costs nothing: the vocabulary
 * below 5.0 is enormous.
 *
 * Adding a picture means adding it here, and checking its Emoji version first.
 * No font is shipped: a colour emoji font is megabytes, and the whole point of
 * a glyph is that it costs nothing.
 *
 * **No keycap sequences.** 1️⃣ is a digit, a variation selector and a combining
 * enclosing keycap rather than one character, and it renders inconsistently
 * even where every part of it exists. Plain `'1'` is not an emoji at all,
 * draws perfectly at the size the things are drawn at, and is what the houses
 * already have numbers written on them in.
 *
 * A list in a test says a glyph is allowed; only the television says it
 * renders. The debug panel draws the whole of this list at the bottom of
 * itself, so that pressing `d` on the stick and looking is the check —
 * anything that comes up a box comes off the list.
 */
export const SAFE_GLYPHS = [
  // The things being carried, and the houses they go to.
  '🍎', // 1.0  apple
  '🥧', // 5.0  pie
  '🍖', // 1.0  meat on bone
  '🐶', // 1.0  dog
  '🐟', // 1.0  fish
  '🐱', // 1.0  cat
  '👕', // 1.0  t-shirt
  '🚪', // 1.0  door — the wardrobe
  '✉️', // 1.0  envelope
  '📮', // 1.0  postbox
  '🥚', // 3.0  egg
  '🍳', // 1.0  frying pan
  '🎁', // 1.0  wrapped gift
  '🛷', // 5.0  sled
  '🍌', // 1.0  banana
  '🗑️', // 1.0  wastebasket

  // Things that go in an order, and the houses that ask for them.
  '🍽️', // 1.0  fork and knife with plate
  '🍞', // 1.0  bread
  '🧀', // 1.0  cheese
  '🚦', // 1.0  vertical traffic light
  '🔢', // 1.0  input numbers
  '1', // —    a digit, and no kind of emoji at all
  '2', // —
  '3', // —

  // Things thrown in dodge.
  '🍅', // 1.0  tomato
  '💧', // 1.0  droplet
  '⚪', // 1.0  white circle — a snowball
  '🍂', // 1.0  fallen leaf

  // Badges worn beside a name.
  '👑', // 1.0  crown
  '🥔', // 3.0  potato
  '✏️', // 1.0  pencil
  '🏁', // 1.0  chequered flag
  '✨', // 1.0  sparkles — a blob gone fuzzy
  '♥', // —    a plain heart, and text rather than emoji
] as const

/**
 * Whether every character of this string is something the television can draw.
 *
 * A badge can be a run of the same glyph — three hearts is three lives — so it
 * is judged a character at a time, and a trailing U+FE0F goes with the
 * character in front of it: ✉️ is an envelope and a request to draw it in
 * colour rather than two pictures.
 */
export function isSafeGlyph(glyph: string): boolean {
  const characters = pictures(glyph)
  if (characters.length === 0) return false
  return characters.every((one) => (SAFE_GLYPHS as readonly string[]).includes(one))
}

/** The one-by-one pictures in a string, with their variation selectors kept on. */
function pictures(glyph: string): string[] {
  const found: string[] = []
  for (const character of glyph) {
    // U+FE0F asks for the colour form of what came before it; U+20E3 is the
    // keycap box, which is on the list precisely so it can be refused.
    if ((character === '️' || character === '⃣') && found.length > 0) {
      found[found.length - 1] += character
      continue
    }
    found.push(character)
  }
  return found
}
