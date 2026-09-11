// Network-first for everything; the cache is only a fallback. Registered as `/sw.js?v=<build>`,
// so each build gets its own cache and the old one is dropped on activation.

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `make-believe-${VERSION}`

/** The worker never touches the socket, the version check or the TV's page. */
function isOurs(url) {
  if (url.origin !== self.location.origin) return false
  if (url.pathname === '/ws' || url.pathname === '/version') return false
  return !url.pathname.startsWith('/host/')
}

self.addEventListener('install', () => {
  // Nothing to precache, so take over at once; the page decides when to reload into the new build.
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

/** Every navigation is the same page, so all of them are cached under `/`. */
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
