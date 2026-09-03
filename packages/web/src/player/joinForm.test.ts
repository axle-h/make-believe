import { describe, expect, it } from 'vitest'
import { evaluateJoinForm, joinFormError } from './joinForm.js'

describe('evaluateJoinForm', () => {
  it('takes a name and normalises it', () => {
    expect(evaluateJoinForm('  Wilf ')).toEqual({
      name: 'Wilf',
      nameValid: true,
      canJoin: true,
    })
  })

  it('will not join without a name', () => {
    const blank = evaluateJoinForm('   ')
    expect(blank.nameValid).toBe(false)
    expect(blank.canJoin).toBe(false)
  })

  it('will not join with a name longer than the cap', () => {
    const long = evaluateJoinForm('Wilfred')
    expect(long.nameValid).toBe(false)
    expect(long.canJoin).toBe(false)
  })
})

describe('joinFormError', () => {
  it('asks for a name, and says nothing when there is one', () => {
    expect(joinFormError(evaluateJoinForm(''))).toBe('Your blob needs a name.')
    expect(joinFormError(evaluateJoinForm('Ida'))).toBe('')
  })

  it('says how long a name may be, rather than that it is missing', () => {
    expect(joinFormError(evaluateJoinForm('Wilfred'))).toBe('5 letters at most.')
  })
})
