export interface HeadlineParts {
  before: string
  word: string
  after: string
}

// Both screens split a brief around its `emphasis` here, so they paint the same word. One that
// is not in the headline paints nothing rather than throwing; the schema refuses it on the wire.
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
