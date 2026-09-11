import qrcode from 'qrcode-generator'


const ERROR_CORRECTION = 'M'
const AUTO_TYPE = 0

/** Built from the TV page's origin, so open the TV by LAN IP or hostname, never `localhost`. */
export function joinUrl(origin: string): string {
  return `${origin}/`
}

export function qrSvg(url: string): string {
  const code = qrcode(AUTO_TYPE, ERROR_CORRECTION)
  code.addData(url)
  code.make()
  return code.createSvgTag({ cellSize: 1, margin: 1, scalable: true })
}
