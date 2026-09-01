import { MAX_PNG_LENGTH } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { CANVAS_SIZE, cornerRadius, isSendablePng, pointerToCanvas } from './drawing.js'

const onScreen = { left: 20, top: 100, width: 320, height: 320 }
const png = (length: number) => `data:image/png;base64,${'A'.repeat(length)}`

describe('pointerToCanvas', () => {
  it('scales a finger on a big canvas back to drawing pixels', () => {
    expect(pointerToCanvas(onScreen, { x: 20, y: 100 })).toEqual({ x: 0, y: 0 })
    expect(pointerToCanvas(onScreen, { x: 180, y: 260 })).toEqual({ x: 128, y: 128 })
    expect(pointerToCanvas(onScreen, { x: 340, y: 420 })).toEqual({ x: CANVAS_SIZE, y: CANVAS_SIZE })
  })

  it('holds a finger that slides off the edge at the edge', () => {
    expect(pointerToCanvas(onScreen, { x: -50, y: 500 })).toEqual({ x: 0, y: CANVAS_SIZE })
  })

  it('copes with a canvas that has not been laid out yet', () => {
    expect(pointerToCanvas({ left: 0, top: 0, width: 0, height: 0 }, { x: 5, y: 5 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('works at another size', () => {
    expect(pointerToCanvas(onScreen, { x: 180, y: 260 }, 128)).toEqual({ x: 64, y: 64 })
  })
})

describe('cornerRadius', () => {
  it('keeps the blob shape at any size', () => {
    expect(cornerRadius(72)).toBe(14)
    expect(cornerRadius(CANVAS_SIZE)).toBe(50)
  })
})

describe('isSendablePng', () => {
  it('accepts a doodle', () => {
    expect(isSendablePng(png(4_000))).toBe(true)
  })

  it('refuses something that is not a png data url', () => {
    expect(isSendablePng('https://example.com/a.png')).toBe(false)
    expect(isSendablePng('data:image/jpeg;base64,AAAA')).toBe(false)
  })

  it('refuses one the server would drop for being too big', () => {
    expect(isSendablePng(png(MAX_PNG_LENGTH))).toBe(false)
  })
})
