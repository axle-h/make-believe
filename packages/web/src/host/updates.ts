/**
 * When a new build is allowed to take the *TV* over. Pure, so the rule can be
 * tested without a `location` anywhere near it.
 *
 * ## Why the TV needs this at all
 *
 * A phone finds out it is stale on its own — `/version` against its own build,
 * on every connect. The TV had nothing: it is a stick behind a television that
 * gets switched on and left, and the only ways to update it were the Menu key
 * on the remote or somebody noticing. A TV a fortnight behind its phones is
 * the one staleness nobody in the room can see.
 *
 * ## Why the safe moment is a much smaller one
 *
 * The phone reloads whenever it is on its waiting screen, which costs nothing
 * because a phone holds no game state. **The host holds all of it.** Reloading
 * the TV destroys every blob in the world — its name, its colour, the picture
 * a child drew on it — and the relay mints a fresh session code behind it, so
 * every phone still attached drops its identity and comes back as somebody
 * new.
 *
 * So there is exactly one moment where a reload costs nothing, and it is the
 * one where **there is nobody in the world at all**. Not "between tasks", not
 * "during the interlude" — a blob standing on the floor while its child is
 * fetching a drink is a blob that must still be there when they get back. An
 * away blob is still in the world for exactly that reason, and only stops
 * being in it once the world itself has given up on it.
 *
 * That makes an update *pending* rather than immediate, sometimes for a whole
 * evening, which is right: the TV is a window onto a world, and it may not
 * throw the world away to be tidy.
 */

/**
 * How often the TV asks whether it is stale.
 *
 * The phone asks on every connect, which is enough for something carried about
 * a house. A TV holds one socket open for hours and would ask once all evening,
 * so it polls as well. Two minutes is far more often than anybody deploys and
 * costs one small request; the check is nearly always "no", and even when it is
 * "yes" nothing happens until the room is empty.
 */
export const VERSION_POLL_MS = 120_000

/**
 * Whether a reload would cost nothing. It costs nothing only when there is
 * nothing to lose: no blobs, away or otherwise.
 */
export function isSafeToReload(blobsInWorld: number): boolean {
  return blobsInWorld === 0
}

/** Whether to take a waiting build now, or hold it until the room empties. */
export function shouldReload(blobsInWorld: number, updatePending: boolean): boolean {
  return updatePending && isSafeToReload(blobsInWorld)
}
