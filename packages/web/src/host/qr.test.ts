import { describe, expect, it } from 'vitest'
import { joinUrl, qrSvg } from './qr.js'

describe('joinUrl', () => {
  it('points a phone at the player page with the code filled in', () => {
    expect(joinUrl('http://10.0.0.5:3000', 'WXYZ')).toBe('http://10.0.0.5:3000/?room=WXYZ')
  })

  it('keeps a hostname origin intact', () => {
    expect(joinUrl('https://believe.ax-h.com', 'AB23')).toBe('https://believe.ax-h.com/?room=AB23')
  })
})

describe('qrSvg', () => {
  it('draws a scalable svg with something in it', () => {
    const svg = qrSvg(joinUrl('http://10.0.0.5:3000', 'WXYZ'))
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox')
    expect(svg).toContain('<path')
  })

  it('draws a different code for a different room', () => {
    const first = qrSvg(joinUrl('http://10.0.0.5:3000', 'WXYZ'))
    const second = qrSvg(joinUrl('http://10.0.0.5:3000', 'AB23'))
    expect(first).not.toBe(second)
  })
})
