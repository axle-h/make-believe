import { describe, expect, it } from 'vitest'
import { guessMatches, normaliseGuess } from './guessing.js'

describe('tidying up a guess', () => {
  it('throws away everything but the letters', () => {
    expect(normaliseGuess('  Is it a CAT?! ')).toBe('is it a cat')
    expect(normaliseGuess('!!!')).toBe('')
  })
})

describe('did they guess it', () => {
  it('takes the word on its own, however it was typed', () => {
    expect(guessMatches('cat', 'cat')).toBe(true)
    expect(guessMatches('CAT!', 'cat')).toBe(true)
    expect(guessMatches('  cat  ', 'cat')).toBe(true)
  })

  it('takes the word said in a sentence', () => {
    expect(guessMatches('is it a cat', 'cat')).toBe(true)
    expect(guessMatches('i think thats an ice cream', 'ice cream')).toBe(true)
  })

  it('takes a plural, because nobody is marking spelling', () => {
    expect(guessMatches('cats', 'cat')).toBe(true)
    expect(guessMatches('a house', 'house')).toBe(true)
  })

  /** A four-year-old typing on a phone gets one letter wrong constantly. */
  it('takes a near miss', () => {
    expect(guessMatches('kat', 'cat')).toBe(true)
    expect(guessMatches('rockat', 'rocket')).toBe(true)
    expect(guessMatches('dinosuar', 'dinosaur')).toBe(true)
  })

  it('does not take a different word that merely looks like it', () => {
    expect(guessMatches('catapult', 'cat')).toBe(false)
    expect(guessMatches('dog', 'cat')).toBe(false)
    expect(guessMatches('cow', 'dog')).toBe(false)
    expect(guessMatches('boat', 'goat')).toBe(true)
  })

  it('does not take nothing at all', () => {
    expect(guessMatches('', 'cat')).toBe(false)
    expect(guessMatches('???', 'cat')).toBe(false)
  })
})
