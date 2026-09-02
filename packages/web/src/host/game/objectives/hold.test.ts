import { describe, expect, it } from 'vitest'
import { hold, secondsLeft } from './hold.js'

describe('holding still', () => {
  it('is not done until it has been held long enough', () => {
    const holding = { holdMs: 1000, heldMs: 0 }

    expect(hold(holding, true, 999)).toBe(false)
    expect(hold(holding, true, 1)).toBe(true)
  })

  it('drains rather than throwing it away when they let go', () => {
    const holding = { holdMs: 1000, heldMs: 0 }
    hold(holding, true, 800)

    expect(hold(holding, false, 200)).toBe(false)
    expect(holding.heldMs).toBe(600)
  })

  it('never drains below nothing', () => {
    const holding = { holdMs: 1000, heldMs: 100 }
    hold(holding, false, 5000)

    expect(holding.heldMs).toBe(0)
  })

  it('counts down in whole seconds, and never says nought', () => {
    expect(secondsLeft({ holdMs: 3000, heldMs: 0 })).toBe(3)
    expect(secondsLeft({ holdMs: 3000, heldMs: 2100 })).toBe(1)
    expect(secondsLeft({ holdMs: 3000, heldMs: 3000 })).toBe(1)
  })
})
