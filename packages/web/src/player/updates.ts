/**
 * When a new build is allowed to take the page over, and how the phone tells
 * that the server is serving a different one. Both are pure so the rules can
 * be tested without a service worker anywhere near them.
 */

/** The four things the phone can be doing. Only one is ever on screen. */
export type Screen = 'scan' | 'join' | 'waiting' | 'play'

/**
 * The screens where a reload costs nothing. Reloading mid-joystick would leave
 * a blob running across the TV; mid-join it would throw away a half-typed
 * name. Waiting and scanning are the moments where nobody is holding anything.
 */
const SAFE: ReadonlySet<Screen> = new Set(['scan', 'waiting'])

export function isSafeToReload(screen: Screen): boolean {
  return SAFE.has(screen)
}

/** Whether to take a waiting update now, or leave it pending a bit longer. */
export function shouldReload(screen: Screen, updatePending: boolean): boolean {
  return updatePending && isSafeToReload(screen)
}

/**
 * Whether the server is serving a build other than this page's.
 *
 * Versions are opaque — a git SHA, or a timestamp when there is no git — so
 * "different" is the only question that can be asked of them; there is no
 * newer or older. A blank on either side means we do not know, which is not a
 * reason to reload anyone.
 */
export function isDifferentBuild(page: string, served: string): boolean {
  const mine = page.trim()
  const theirs = served.trim()
  if (mine === '' || theirs === '') return false
  return mine !== theirs
}
