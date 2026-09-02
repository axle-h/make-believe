import { describe, expect, it } from 'vitest'
import { roomFromScan } from './scanner.js'

const HERE = 'https://believe.ax-h.com'

describe('roomFromScan', () => {
  it('takes the code out of the link the TV shows', () => {
    expect(roomFromScan(`${HERE}/?room=WXYZ`, HERE)).toBe('WXYZ')
  })

  it('tidies up a code that came through in lower case', () => {
    expect(roomFromScan(`${HERE}/?room=ab23`, HERE)).toBe('AB23')
  })

  it('ignores a TV on some other server', () => {
    expect(roomFromScan('http://10.0.0.5:5173/?room=WXYZ', HERE)).toBe('')
  })

  it('ignores our own address with no code on it', () => {
    expect(roomFromScan(`${HERE}/`, HERE)).toBe('')
  })

  it('ignores a code that is not a code', () => {
    expect(roomFromScan(`${HERE}/?room=OOPS`, HERE)).toBe('')
    expect(roomFromScan(`${HERE}/?room=TOOLONG`, HERE)).toBe('')
  })

  it('ignores everything else a camera might see', () => {
    expect(roomFromScan('WIFI:S=kitchen;T=WPA;P=hunter2;;', HERE)).toBe('')
    expect(roomFromScan('WXYZ', HERE)).toBe('')
    expect(roomFromScan('', HERE)).toBe('')
  })
})
