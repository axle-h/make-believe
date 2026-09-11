/**
 * Generous matching: "kat" guesses the cat, and so does "is it a cat". Case, punctuation and
 * plurals are ignored and a letter may be wrong, but "catapult" is not a cat.
 */

export function normaliseGuess(said: string): string {
  return said
    .toLowerCase()
    .replaceAll(/[^a-z ]+/g, ' ')
    .replaceAll(/ +/g, ' ')
    .trim()
}

export function guessMatches(said: string, word: string): boolean {
  const guess = normaliseGuess(said)
  const target = normaliseGuess(word)
  if (guess.length === 0 || target.length === 0) return false

  if (words(guess).some((one) => sameWord(one, target))) return true
  if (target.includes(' ') && saysPhrase(words(guess), words(target))) return true

  return [guess, ...words(guess)].some((one) => within(one, target))
}

function saysPhrase(said: string[], phrase: string[]): boolean {
  for (let start = 0; start + phrase.length <= said.length; start++) {
    if (phrase.every((word, index) => sameWord(said[start + index] as string, word))) return true
  }
  return false
}

function words(guess: string): string[] {
  return guess.split(' ').filter((word) => word.length > 0)
}

function sameWord(one: string, other: string): boolean {
  return one === other || one === `${other}s` || `${one}s` === other
}

/** One wrong letter in a short word, two in a long one: with two, "dog" would match "cow". */
function within(one: string, other: string): boolean {
  const allowed = other.length <= 5 ? 1 : 2
  if (Math.abs(one.length - other.length) > allowed) return false
  return editDistance(one, other) <= allowed
}

function editDistance(one: string, other: string): number {
  let previous = Array.from({ length: other.length + 1 }, (_, index) => index)
  for (let i = 1; i <= one.length; i++) {
    const row = [i]
    for (let j = 1; j <= other.length; j++) {
      const cost = one[i - 1] === other[j - 1] ? 0 : 1
      row.push(
        Math.min(
          (previous[j] as number) + 1,
          (row[j - 1] as number) + 1,
          (previous[j - 1] as number) + cost,
        ),
      )
    }
    previous = row
  }
  return previous[other.length] as number
}
