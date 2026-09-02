import { isValidRoomCode, normaliseRoomCode } from '@make-believe/shared'

/**
 * Reading the TV's QR code with the phone's own camera.
 *
 * A phone running from its icon has no address bar and no way out to the
 * camera app, so once tonight's code has gone stale the only way back in is to
 * look at the TV from in here. Chromium's `BarcodeDetector` does the reading;
 * where it does not exist there is no offer to (see `canScan`), and the way in
 * is the camera app, as it always was.
 */

/** How often to look at the camera for a code. Faster than an eye can aim. */
const LOOK_MS = 200

/** `HAVE_CURRENT_DATA`: below this the video has no frame to read. */
const HAVE_FRAME = 2

/**
 * The code inside something the camera read, or '' if that was not the TV.
 *
 * The TV's QR code holds the player page's own address with tonight's code on
 * it, so anything else — a cereal box, a wifi code, another deployment's TV —
 * is nothing to do with us and is quietly ignored rather than complained
 * about: the camera stays open, and the next look might find the real thing.
 */
export function roomFromScan(value: string, origin: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return ''
  }
  if (url.origin !== origin) return ''
  const code = normaliseRoomCode(url.searchParams.get('room') ?? '')
  return isValidRoomCode(code) ? code : ''
}

/** Whether this browser can read a QR code at all. Chromium on Android can. */
export function canScan(): boolean {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

/** A camera that is running. */
export interface Scan {
  /** Put the camera away. Safe to call twice, and safe to call after a hit. */
  stop(): void
}

/**
 * Point the camera at the world and watch for the TV. Resolves once the camera
 * is running — it rejects if there is none, or if permission was refused — and
 * calls `onRoom` at most once, stopping itself the moment it finds a code.
 */
export async function startScan(
  video: HTMLVideoElement,
  origin: string,
  onRoom: (room: string) => void,
): Promise<Scan> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  })
  video.srcObject = stream
  try {
    await video.play()
  } catch {
    // Autoplay refused. The frames are there to read either way.
  }

  const detector = new BarcodeDetector({ formats: ['qr_code'] })
  let stopped = false
  /** One look at a time: a slow frame must not stack up behind the timer. */
  let looking = false
  const timer = setInterval(() => void look(), LOOK_MS)

  function stop(): void {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    for (const track of stream.getTracks()) track.stop()
    video.srcObject = null
  }

  async function look(): Promise<void> {
    if (stopped || looking || video.readyState < HAVE_FRAME) return
    looking = true
    try {
      const codes = await detector.detect(video)
      if (stopped) return
      for (const code of codes) {
        const room = roomFromScan(code.rawValue, origin)
        if (!room) continue
        stop()
        onRoom(room)
        return
      }
    } catch {
      // A frame it could not make sense of. There is another one coming.
    } finally {
      looking = false
    }
  }

  return { stop }
}
