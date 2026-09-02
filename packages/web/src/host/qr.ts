import qrcode from 'qrcode-generator'

/**
 * The QR code on the TV. It carries nothing but the player page's own address:
 * a phone scans it once to find the game, installs it if it likes, and never
 * needs the TV's help again. Which world it has reached is settled on the
 * socket, not in this link.
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
export function joinUrl(origin: string): string {
  return `${origin}/`
}

/** An `<svg>` string for a URL, sized by CSS rather than by pixels. */
export function qrSvg(url: string): string {
  const code = qrcode(AUTO_TYPE, ERROR_CORRECTION)
  code.addData(url)
  code.make()
  return code.createSvgTag({ cellSize: 1, margin: 1, scalable: true })
}
