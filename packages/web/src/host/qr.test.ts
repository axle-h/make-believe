import { describe, expect, it } from 'vitest'
import { joinUrl, qrSvg } from './qr.js'

describe('joinUrl', () => {
  it('points a phone at the player page and nothing else', () => {
    expect(joinUrl('http://10.0.0.5:3000')).toBe('http://10.0.0.5:3000/')
  })

  it('keeps a hostname origin intact', () => {
    expect(joinUrl('https://believe.ax-h.com')).toBe('https://believe.ax-h.com/')
  })

  /**
   * The link is the same one every night. Anything that put a session in it
   * would make an installed phone's saved address go stale, which is the whole
   * thing this arrangement exists to avoid.
   */
  it('carries no session of any kind', () => {
    expect(joinUrl('https://believe.ax-h.com')).not.toContain('?')
  })
})

describe('qrSvg', () => {
  it('draws a scalable svg with something in it', () => {
    const svg = qrSvg(joinUrl('http://10.0.0.5:3000'))
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox')
    expect(svg).toContain('<path')
  })

  it('draws a different code for a different address', () => {
    const first = qrSvg(joinUrl('http://10.0.0.5:3000'))
    const second = qrSvg(joinUrl('https://believe.ax-h.com'))
    expect(first).not.toBe(second)
  })
})
