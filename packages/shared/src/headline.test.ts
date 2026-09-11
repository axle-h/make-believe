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

  it('paints the first of two', () => {
    expect(splitHeadline('Green means green!', 'green')).toEqual({
      before: 'Green means ',
      word: 'green',
      after: '!',
    })
  })

  /** The schema refuses this on the wire; a renderer handed it anyway still draws the sentence. */
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
