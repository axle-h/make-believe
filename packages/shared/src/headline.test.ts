import { describe, expect, it } from 'vitest'
import { splitHeadline } from './headline.js'

describe('painting one word of a headline', () => {
  it('splits the sentence around it', () => {
    expect(splitHeadline('Everybody go green!', 'green')).toEqual({
      before: 'Everybody go ',
      word: 'green',
      after: '!',
    })
  })

  it('copes with the word at the very start', () => {
    expect(splitHeadline('Green, everybody!', 'Green')).toEqual({
      before: '',
      word: 'Green',
      after: ', everybody!',
    })
  })

  it('copes with the word at the very end', () => {
    expect(splitHeadline('Everybody go green', 'green')).toEqual({
      before: 'Everybody go ',
      word: 'green',
      after: '',
    })
  })

  /** The first one is the one that gets painted; the rest are just words. */
  it('paints the first of two', () => {
    expect(splitHeadline('Green means green!', 'green')).toEqual({
      before: 'Green means ',
      word: 'green',
      after: '!',
    })
  })

  /**
   * The schema refuses a word that is not in its headline, so this is the
   * renderer being handed something impossible — and the sentence is still
   * worth more than nothing at all.
   */
  it('draws the sentence unpainted rather than dropping it', () => {
    expect(splitHeadline('Everybody go green!', 'blue')).toEqual({
      before: 'Everybody go green!',
      word: '',
      after: '',
    })
    expect(splitHeadline('Everybody go green!')).toEqual({
      before: 'Everybody go green!',
      word: '',
      after: '',
    })
    expect(splitHeadline('Everybody go green!', '')).toEqual({
      before: 'Everybody go green!',
      word: '',
      after: '',
    })
  })
})
