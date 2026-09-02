/**
 * Ambient bits the browser and Vite bring that TypeScript does not know about.
 */

/** The build this page came from; injected by Vite. See `vite.config.ts`. */
declare const __BUILD_VERSION__: string

/**
 * Chrome's install prompt. Not in lib.dom, because it is not standard — every
 * use of it is behind a check that the event actually fired.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent
}
