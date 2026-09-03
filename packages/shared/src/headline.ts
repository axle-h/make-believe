/**
 * One word of a headline, painted.
 *
 * "Everybody go green!" was written in the same white as everything else, so
 * the one word that is the whole instruction was the one word a child who
 * cannot read had no way to get at. A brief may name a word inside its own
 * headline as its `emphasis`, and both screens draw that word in the brief's
 * colour: three parts on one line on the TV, a span in the middle on a phone.
 *
 * It is pure and it lives here because both ends have to split the sentence
 * the same way, and neither of them may decide which word it is — the world
 * says so, as it says everything else.
 */

export interface HeadlineParts {
  before: string
  /** The painted word, or `''` when there is nothing to paint. */
  word: string
  after: string
}

/**
 * The headline in three parts, around the first occurrence of `emphasis`.
 *
 * A word that is not in the headline paints nothing rather than throwing: the
 * schema is what refuses that on the wire, and a renderer handed one anyway
 * should draw the sentence rather than nothing at all.
 */
export function splitHeadline(headline: string, emphasis?: string): HeadlineParts {
  if (emphasis === undefined || emphasis.length === 0) {
    return { before: headline, word: '', after: '' }
  }
  const at = headline.indexOf(emphasis)
  if (at === -1) return { before: headline, word: '', after: '' }
  return {
    before: headline.slice(0, at),
    word: emphasis,
    after: headline.slice(at + emphasis.length),
  }
}
