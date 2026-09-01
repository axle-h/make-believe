import qrcode from 'qrcode-generator'

/**
 * The QR code on the TV. Scanning it opens the player page with tonight's code
 * already filled in, so a phone joins without anybody typing anything.
 */

/** How much of the code can be lost and still scan; `M` survives a TV's glare. */
const ERROR_CORRECTION = 'M'
/** Let the library pick the smallest symbol that fits the URL. */
const AUTO_TYPE = 0

/**
 * The address a phone should open. It has to be the address the phone can
 * reach, so it comes from the page's own origin: open the TV by LAN IP or
 * hostname, never `localhost`, or the QR code will point every phone at itself.
 */
export function joinUrl(origin: string, roomCode: string): string {
  return `${origin}/?room=${encodeURIComponent(roomCode)}`
}

/** An `<svg>` string for a URL, sized by CSS rather than by pixels. */
export function qrSvg(url: string): string {
  const code = qrcode(AUTO_TYPE, ERROR_CORRECTION)
  code.addData(url)
  code.make()
  return code.createSvgTag({ cellSize: 1, margin: 1, scalable: true })
}
