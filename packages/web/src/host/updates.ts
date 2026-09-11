// The TV takes a new build only into a world with no blobs at all: not between tasks, not for a
// blob that is merely away. The host holds all state, and a reload destroys every blob and picture.

export const VERSION_POLL_MS = 120_000

export function isSafeToReload(blobsInWorld: number): boolean {
  return blobsInWorld === 0
}

export function shouldReload(blobsInWorld: number, updatePending: boolean): boolean {
  return updatePending && isSafeToReload(blobsInWorld)
}
