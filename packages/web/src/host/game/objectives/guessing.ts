/**
 * Was that the word? A four-year-old typing "kat" on a phone keyboard has
 * guessed the cat, and a game that says otherwise is a game they stop playing.
 *
 * So the matching is deliberately generous: case and punctuation are ignored,
 * a guess may be a whole sentence with the word somewhere in it, plurals are
 * the same word, and a letter may be wrong. What it will not do is accept a
 * different word that happens to look a bit like it — "catapult" is not a cat.
 */

/** Everything but letters and single spaces, gone. */
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

  // "is it a cat" is a guess at a cat. The word has to stand on its own,
  // though: a catapult is a different thing entirely.
  if (words(guess).some((one) => sameWord(one, target))) return true
  if (target.includes(' ') && saysPhrase(words(guess), words(target))) return true

  // ...and one letter may be wrong, in the whole guess or in any word of it.
  return [guess, ...words(guess)].some((one) => within(one, target))
}

/** A two-word answer said somewhere in a sentence: "thats an ice cream". */
function saysPhrase(said: string[], phrase: string[]): boolean {
  for (let start = 0; start + phrase.length <= said.length; start++) {
    if (phrase.every((word, index) => sameWord(said[start + index] as string, word))) return true
  }
  return false
}

function words(guess: string): string[] {
  return guess.split(' ').filter((word) => word.length > 0)
}

/** The same word, allowing for a plural on either side. */
function sameWord(one: string, other: string): boolean {
  return one === other || one === `${other}s` || `${one}s` === other
}

/**
 * Near enough: one wrong letter in a short word, two in a long one. Short
 * words are strict on purpose — with two letters of slack, "dog" and "cow"
 * would start matching things nobody meant.
 */
function within(one: string, other: string): boolean {
  const allowed = other.length <= 5 ? 1 : 2
  if (Math.abs(one.length - other.length) > allowed) return false
  return editDistance(one, other) <= allowed
}

/** How many single-letter changes turn one word into the other. */
function editDistance(one: string, other: string): number {
  // One row of the usual table at a time: the words are a dozen letters at most.
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
