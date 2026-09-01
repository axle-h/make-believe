import { MAX_NAME_LENGTH } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { evaluateJoinForm, joinFormError } from './joinForm.js'

describe('evaluateJoinForm', () => {
  it('accepts a good code and name, normalised', () => {
    expect(evaluateJoinForm(' wxyz ', '  Big   Ted ')).toEqual({
      room: 'WXYZ',
      name: 'Big Ted',
      roomValid: true,
      nameValid: true,
      canJoin: true,
    })
  })

  it('will not join on a bad code', () => {
    expect(evaluateJoinForm('WXY', 'Wilf').canJoin).toBe(false)
    expect(evaluateJoinForm('WX0Z', 'Wilf').roomValid).toBe(false)
    expect(evaluateJoinForm('', 'Wilf').canJoin).toBe(false)
  })

  it('will not join without a name', () => {
    expect(evaluateJoinForm('WXYZ', '').canJoin).toBe(false)
    expect(evaluateJoinForm('WXYZ', '   ').nameValid).toBe(false)
    expect(evaluateJoinForm('WXYZ', 'x'.repeat(MAX_NAME_LENGTH + 1)).canJoin).toBe(false)
  })

  it('keeps the two fields independent', () => {
    const state = evaluateJoinForm('WXY', '')
    expect(state.roomValid).toBe(false)
    expect(state.nameValid).toBe(false)

    const nameOnly = evaluateJoinForm('WXY', 'Wilf')
    expect(nameOnly.roomValid).toBe(false)
    expect(nameOnly.nameValid).toBe(true)
  })
})

describe('joinFormError', () => {
  it('complains about the code first, then the name, then not at all', () => {
    expect(joinFormError(evaluateJoinForm('WXY', ''))).toMatch(/code/i)
    expect(joinFormError(evaluateJoinForm('WXYZ', ''))).toMatch(/name/i)
    expect(joinFormError(evaluateJoinForm('WXYZ', 'Wilf'))).toBe('')
  })
})
