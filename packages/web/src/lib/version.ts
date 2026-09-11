/** Versions are opaque, so a build is only ever different, never newer. */
export function isDifferentBuild(page: string, served: string): boolean {
  const mine = page.trim()
  const theirs = served.trim()
  if (!looksLikeVersion(mine) || !looksLikeVersion(theirs)) return false
  return mine !== theirs
}

// The dev server answers `/version` with the index page, so an answer that is not a version
// is not an answer. Otherwise a page in dev takes the HTML for a new build and reloads for ever.
function looksLikeVersion(answer: string): boolean {
  if (answer === '' || answer.length > MAX_VERSION_LENGTH) return false
  return !/[\s<]/.test(answer)
}

const MAX_VERSION_LENGTH = 200
