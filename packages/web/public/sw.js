/**
 * The player page's service worker. It exists so the app opens from its icon
 * even when the server is not there — and, more often, so it can say it cannot
 * reach the TV rather than showing Chrome's dinosaur.
 *
 * Network-first for everything. The phone is on the same wifi as the server
 * and the page is a few kilobytes, so fresh is the normal case and the cache
 * is only ever a fallback. That also means there is no precache manifest to
 * keep in step with Vite's hashed filenames: the cache holds whatever was
 * successfully fetched, and nothing else.
 *
 * Registered as `/sw.js?v=<build>` — a new build therefore registers a new
 * worker, and the version in the query names the cache, so the old build's
 * cache is dropped on activation.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `make-believe-${VERSION}`

/**
 * Paths the worker keeps its hands off entirely: the socket, the TV's own page
 * (which is never installed and must never be served from a phone's cache),
 * and the version check, whose whole job is to be fresh.
 */
function isOurs(url) {
  if (url.origin !== self.location.origin) return false
  if (url.pathname === '/ws' || url.pathname === '/version') return false
  return !url.pathname.startsWith('/host/')
}

self.addEventListener('install', () => {
  // Nothing to precache, so the new worker is ready immediately. It still
  // waits for the page to be on a safe screen before it takes over — that is
  // the page's decision, made when it sees the controller change.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (!isOurs(new URL(request.url))) return
  event.respondWith(networkFirst(request))
})

/**
 * The QR link carries tonight's code in the query, so every scan is a new URL
 * for the same page. Navigations are cached under the bare path instead, or
 * the cache would fill with a copy per code and match none of them next time.
 */
function cacheKey(request) {
  return request.mode === 'navigate' ? new Request('/') : request
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(cacheKey(request), response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(cacheKey(request))
    if (cached) return cached
    throw error
  }
}
