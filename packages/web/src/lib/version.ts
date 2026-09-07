/**
 * Whether the server is serving a build other than this page's.
 *
 * Both pages ask it, which is why it lives here rather than beside either of
 * them: a phone that stayed open across a deploy and a TV that has been on
 * since Tuesday have exactly the same question, and the answer must not drift
 * apart in two copies.
 *
 * Versions are opaque — a git SHA, or a timestamp when there is no git — so
 * "different" is the only question that can be asked of them; there is no
 * newer or older.
 */
export function isDifferentBuild(page: string, served: string): boolean {
  const mine = page.trim()
  const theirs = served.trim()
  // Anything that is not a version means we do not know what the server is
  // running, and not knowing is never a reason to reload anybody.
  if (!looksLikeVersion(mine) || !looksLikeVersion(theirs)) return false
  return mine !== theirs
}

/**
 * Whether an answer is a version at all.
 *
 * ⚠️ This is not fussiness. **The dev server answers `/version` with the whole
 * index page, 200 and `text/html`** — the file is written by a `generateBundle`
 * hook, so it exists only in a real build, and Vite falls back to serving a
 * page for the path. Without this, a page in dev compares its own SHA against a
 * lump of HTML, decides a deploy has happened, reloads, and does the same thing
 * again for ever.
 *
 * A version is a SHA or a millisecond clock: short, one line, and no spaces.
 * An HTML document is none of those things.
 */
function looksLikeVersion(answer: string): boolean {
  if (answer === '' || answer.length > MAX_VERSION_LENGTH) return false
  return !/[\s<]/.test(answer)
}

/** Longer than any SHA or clock, and far shorter than a page. */
const MAX_VERSION_LENGTH = 200
