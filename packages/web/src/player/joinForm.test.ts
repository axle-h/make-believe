import type { PaletteEntry } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import {
  choosableColours,
  evaluateJoinForm,
  joinFormError,
  nameTaken,
  refusalMessage,
} from './joinForm.js'

const RED = '#ff5d5d'
const BLUE = '#4ea8ff'
const GREEN = '#5ddf7f'

function palette(taken: Record<string, string> = {}): PaletteEntry[] {
  return [
    { hex: RED, name: 'red', takenBy: taken[RED] ?? null },
    { hex: BLUE, name: 'blue', takenBy: taken[BLUE] ?? null },
    { hex: GREEN, name: 'green', takenBy: taken[GREEN] ?? null },
  ]
}

describe('evaluateJoinForm', () => {
  it('takes a name and a colour, and normalises the name', () => {
    expect(evaluateJoinForm('  Wilf ', BLUE)).toEqual({
      name: 'Wilf',
      nameValid: true,
      colour: BLUE,
      canJoin: true,
    })
  })

  it('will not join without a name', () => {
    const blank = evaluateJoinForm('   ', BLUE)
    expect(blank.nameValid).toBe(false)
    expect(blank.canJoin).toBe(false)
  })

  it('will not join with a name longer than the cap', () => {
    const long = evaluateJoinForm('Wilfred', BLUE)
    expect(long.nameValid).toBe(false)
    expect(long.canJoin).toBe(false)
  })

  /** A blob is a colour as much as it is a name; there is no default one. */
  it('will not join without a colour', () => {
    const nameless = evaluateJoinForm('Wilf', null)
    expect(nameless.nameValid).toBe(true)
    expect(nameless.canJoin).toBe(false)
  })
})

describe('the row of swatches', () => {
  it('marks the ones somebody already has', () => {
    const choice = choosableColours(palette({ [BLUE]: 'Ida' }), null)

    expect(choice.colours.map((swatch) => swatch.free)).toEqual([true, false, true])
    expect(choice.colours[1]?.takenBy).toBe('Ida')
    expect(choice.full).toBe(false)
  })

  /** A phone comes back to its own colour already selected: one tap to get in. */
  it('keeps the colour this phone wants selected, while it is going', () => {
    expect(choosableColours(palette(), BLUE).chosen).toBe(BLUE)
  })

  /**
   * A colour that has gone selects nothing rather than the next one along. One
   * appearing under a resting thumb is worse than an empty row — and the same
   * rule the other way round means a swatch that comes free simply goes live
   * and waits to be tapped.
   */
  it('selects nothing at all when the colour wanted has gone', () => {
    expect(choosableColours(palette({ [BLUE]: 'Ida' }), BLUE).chosen).toBeNull()
    expect(choosableColours(palette(), null).chosen).toBeNull()
  })

  it('knows when every blob is out playing', () => {
    const full = palette({ [RED]: 'Wilf', [BLUE]: 'Ida', [GREEN]: 'Bo' })

    expect(choosableColours(full, null).full).toBe(true)
    expect(choosableColours(full, RED).chosen).toBeNull()
  })

  it('says nothing about a world it has not heard from yet', () => {
    expect(choosableColours([], BLUE)).toEqual({ colours: [], chosen: null, full: false })
  })
})

describe('a name somebody already has', () => {
  it('is spotted whatever the case, so the screen can say so as it is typed', () => {
    const taken = palette({ [BLUE]: 'Ivy' })

    expect(nameTaken(taken, 'ivy')).toBe(true)
    expect(nameTaken(taken, ' IVY ')).toBe(true)
    expect(nameTaken(taken, 'Ida')).toBe(false)
    expect(nameTaken(palette(), 'Ivy')).toBe(false)
  })
})

describe('joinFormError', () => {
  it('asks for a name, and says nothing when there is one', () => {
    expect(joinFormError(evaluateJoinForm('', BLUE))).toBe('Your blob needs a name.')
    expect(joinFormError(evaluateJoinForm('Ida', BLUE))).toBe('')
  })

  it('says how long a name may be, rather than that it is missing', () => {
    expect(joinFormError(evaluateJoinForm('Wilfred', BLUE))).toBe('5 letters at most.')
  })

  it('asks for a colour once there is a name', () => {
    expect(joinFormError(evaluateJoinForm('Ida', null))).toBe('Pick a colour for your blob.')
  })
})

/**
 * The world says no and why; the sentence is built here from the palette that
 * came with it, which is where the name of whoever took the colour is.
 */
describe('what the world said', () => {
  it('names whoever has the colour this phone wanted', () => {
    expect(refusalMessage('colour', palette({ [BLUE]: 'Bo' }), BLUE)).toBe('Bo has that one now.')
  })

  it('copes with a refusal whose palette says nothing useful', () => {
    expect(refusalMessage('colour', palette(), BLUE)).toBe('Somebody took that colour.')
  })

  it('says the name is taken, without saying whose it is', () => {
    expect(refusalMessage('name', palette({ [BLUE]: 'Ivy' }), BLUE)).toBe(
      'Somebody is already called that.',
    )
  })

  /** The one queue in the game, and it is a physical limit rather than a turn. */
  it('says the world is full, and that it will not be for long', () => {
    expect(refusalMessage('full', palette(), BLUE)).toBe(
      'All ten blobs are out playing. Wait for one to finish!',
    )
  })
})
