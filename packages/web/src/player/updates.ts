export type Screen = 'join' | 'waiting' | 'play'

/** A phone reloads for a new build only on the waiting screen, where nobody is holding anything. */
const SAFE: ReadonlySet<Screen> = new Set(['waiting'])

export function isSafeToReload(screen: Screen): boolean {
  return SAFE.has(screen)
}

export function shouldReload(screen: Screen, updatePending: boolean): boolean {
  return updatePending && isSafeToReload(screen)
}
