/**
 * Ambient bits the browser and Vite bring that TypeScript does not know about.
 */

/** The build this page came from; injected by Vite. See `vite.config.ts`. */
declare const __BUILD_VERSION__: string

/**
 * The browser's own QR reader. Not in lib.dom, because it is Chromium-only —
 * the player page checks for it before it offers to use the camera.
 */
interface DetectedBarcode {
  readonly rawValue: string
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
