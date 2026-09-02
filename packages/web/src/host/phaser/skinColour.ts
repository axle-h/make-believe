import { averageColour, type Rgb } from '../game/index.js'

/**
 * What colour a drawing came out. The model cannot answer this — reading
 * pixels needs a canvas — so the one place that already has the decoded image
 * does it and hands back a single colour.
 *
 * The averaging itself is pure and lives in the model, where it is tested;
 * everything here is the canvas, which is why it is over this side.
 */

/** The size the drawing is squashed to before averaging. */
const SAMPLE = 16

let scratch: HTMLCanvasElement | null = null

export function colourOfImage(image: CanvasImageSource): Rgb | null {
  const canvas = (scratch ??= document.createElement('canvas'))
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  // The same canvas is read on every drawing, which is exactly what this flag
  // is for; without it a browser keeps the surface on the GPU and each read
  // costs a stall.
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  context.clearRect(0, 0, SAMPLE, SAMPLE)
  try {
    context.drawImage(image, 0, 0, SAMPLE, SAMPLE)
    return averageColour(context.getImageData(0, 0, SAMPLE, SAMPLE).data)
  } catch {
    // A drawing that will not decode is not worth taking the TV down for.
    return null
  }
}
