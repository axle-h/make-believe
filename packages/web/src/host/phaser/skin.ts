import { BLOB_CORNER, BLOB_SIZE } from '../game/index.js'

/** The phone lets a child draw on the whole square; the crop to the blob's outline happens here. */

const CORNER_RATIO = BLOB_CORNER / BLOB_SIZE

/** `null` for a PNG that will not decode. Kept at the size it arrived, not the size a blob is drawn. */
export async function cropToBlob(png: string): Promise<HTMLCanvasElement | null> {
  const image = await decode(png)
  if (!image) return null

  const size = image.naturalWidth || image.naturalHeight || BLOB_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return null

  context.beginPath()
  context.roundRect(0, 0, size, size, Math.round(size * CORNER_RATIO))
  context.clip()
  context.drawImage(image, 0, 0, size, size)
  return canvas
}

function decode(png: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => resolve(null))
    image.src = png
  })
}
