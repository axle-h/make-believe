import { BLOB_CORNER, BLOB_SIZE } from '../game/index.js'

/**
 * Cutting a drawing to the shape of a blob.
 *
 * The phone hands over a plain square PNG and lets a child draw anywhere on
 * it, right out to the corners — a four-year-old aiming a finger at a rounded
 * edge does not stop at it, and a tool that quietly refused the last centimetre
 * of the canvas would be a tool that was lying about where the paper ended.
 *
 * So the crop happens here instead, once per drawing, on the side that has a
 * canvas to do it with. What arrives is a square; what goes on the GPU is the
 * blob's own rounded outline with everything outside it cut away.
 *
 * It also settles what colour a drawing came out: the corners are transparent
 * afterwards, so the average is over the picture rather than over the picture
 * and a border of nothing.
 */

/** The blob's outline as a share of its width, so any canvas size can wear it. */
const CORNER_RATIO = BLOB_CORNER / BLOB_SIZE

/**
 * The drawing, cut to the blob's outline. `null` for a PNG that will not
 * decode, which is a drawing not worth taking the TV down for.
 *
 * The result is the size the drawing arrived at rather than the size a blob is
 * drawn at: a phone that sent 256 square keeps its detail, and one that had to
 * halve its picture to fit the wire is not blown back up.
 */
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
  // Squared to the canvas: a phone that sent something not quite square is
  // wearing it stretched either way, and stretched is better than cropped off.
  context.drawImage(image, 0, 0, size, size)
  return canvas
}

/** A data URL as an image the canvas can draw, or `null` if it will not load. */
function decode(png: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => resolve(null))
    image.src = png
  })
}
