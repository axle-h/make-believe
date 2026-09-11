// Every picture the game may draw, in the device's own emoji font. The TV is Fire OS 7 (Android 9,
// Emoji 11), so this list is capped at Emoji 5.0, with no keycap sequences and no shipped font.
// The debug panel draws the whole list, and anything that comes up a box on the TV comes off it.
export const SAFE_GLYPHS = [
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

  '🍽️', // 1.0  fork and knife with plate
  '🍞', // 1.0  bread
  '🧀', // 1.0  cheese
  '🚦', // 1.0  vertical traffic light
  '🔢', // 1.0  input numbers
  '1', // —    a digit, and no kind of emoji at all
  '2', // —
  '3', // —

  '🍅', // 1.0  tomato
  '💧', // 1.0  droplet
  '⚪', // 1.0  white circle — a snowball
  '🍂', // 1.0  fallen leaf

  '👑', // 1.0  crown
  '🥔', // 3.0  potato
  '✏️', // 1.0  pencil
  '🏁', // 1.0  chequered flag
  '✨', // 1.0  sparkles — a blob gone fuzzy
  '♥', // —    a plain heart, and text rather than emoji
] as const

// Judged a character at a time, because a badge can be a run (three hearts is three lives). A
// trailing U+FE0F stays with the character before it: ✉️ is one picture, not two.
export function isSafeGlyph(glyph: string): boolean {
  const characters = pictures(glyph)
  if (characters.length === 0) return false
  return characters.every((one) => (SAFE_GLYPHS as readonly string[]).includes(one))
}

function pictures(glyph: string): string[] {
  const found: string[] = []
  for (const character of glyph) {
    // U+20E3, the keycap box, is kept on its digit so that the pair is refused.
    if ((character === '️' || character === '⃣') && found.length > 0) {
      found[found.length - 1] += character
      continue
    }
    found.push(character)
  }
  return found
}
