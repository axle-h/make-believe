# Planned: phone PWA

The player page becomes an installable Progressive Web App. A child taps "Add to
home screen" once, gets an icon, and from then on the game opens fullscreen with
no browser chrome. Updates are automatic: opening the app picks up the newest
deployed build, and a page left open reloads itself at a safe moment.

Only the player page. The host page is unaffected — the TV gets its own wrapper
(see [android-tv.md](./android-tv.md)).

The secure origin this needs is already in place: <https://believe.ax-h.com>.

## Approach

A hand-written service worker, **no new dependency**. `vite-plugin-pwa` and
Workbox would work but add a build plugin and a lot of generated code for
something that fits in about 60 lines here.

**Network-first for everything, cache as fallback.** The player page is tiny and
the phone is on the same LAN as the server, so fresh-from-the-network is the
normal case; the cache exists only so the app still opens (and says it cannot
reach the TV) when the server is down. Being network-first, there is no precache
manifest to keep in step with Vite's hashed filenames — the worker caches
whatever it successfully fetched.

## Work

**Manifest and icons**

- `packages/web/public/manifest.webmanifest`: `name`/`short_name` "MAKE believe",
  `start_url: "/"`, `scope: "/"`, `display: "fullscreen"` (fall back to
  `standalone` if fullscreen misbehaves with the keyboard on the Say sheet),
  `orientation: "portrait"`, `background_color`, `theme_color`, icons at 192 and
  512 including a `maskable` variant.
- Icon source as an SVG in the repo (a blob). PNGs generated once with a small
  Playwright script (already a dependency) and committed under `public/icons/`.
  Do not add an image library.
- `index.html` (player only) links the manifest and sets `theme-color`.
  `host/index.html` does not.

**Service worker**

- `packages/web/public/sw.js`, plain JS, not bundled: install with `skipWaiting`,
  activate with `clients.claim` and old-cache cleanup, a `fetch` handler that is
  network-first with cache fallback for same-origin GETs and ignores `/ws` and
  `/host/`. The cache name carries the build version so a new build starts a new
  cache.
- Build version: Vite injects `__BUILD_VERSION__` (git short SHA or a timestamp)
  into the player page; the server exposes the same value at `GET /version`.
- Register in `src/player/main.ts` with `updateViaCache: 'none'`. On
  `controllerchange`, reload **only** if the phone is on the scan or waiting
  screen; otherwise flag it and reload on the next return to one of those.
  Never reload mid-joystick.
- On every connect, fetch `/version` and compare with the page's own; on a
  mismatch call `registration.update()` and follow the same safe-reload rule.
  This catches a phone left open across a deploy.
- Re-request the Wake Lock on `visibilitychange` — Android drops it when the app
  is backgrounded. (The player page already takes one on join.)

**Install experience**

- Capture `beforeinstallprompt` and show an "Add to home screen" button on the
  scan screen only when the event fired and the app is not already in
  `display-mode: standalone/fullscreen`. Hide it on `appinstalled`.
- Launching from the icon lands on the scan screen with the last name pre-filled.
  The room code still arrives from the QR link, as it always does.

**Tests**

- Unit: the safe-reload decision as a pure function (current screen, update
  pending) → reload now or defer. And the version compare.
- e2e: `/manifest.webmanifest` and `/sw.js` are served with the right content
  types and `/version` returns the injected value. Do not try to test
  installability in Playwright.

## Done when

`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`, plus a
check on a real Android phone over `https://`: Chrome offers install; the
installed app opens fullscreen; deploy a build with a visible change, reopen, the
change is there; leave it open on the scan screen across a deploy and it reloads
by itself. Chrome DevTools remote debugging shows the manifest with no
installability warnings.
