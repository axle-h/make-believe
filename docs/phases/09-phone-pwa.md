---
phase: 9
title: Phone PWA
status: not-started
updated: 2026-09-01
---

# Phase 9 — Phone PWA

## Goal

The player page is an installable Progressive Web App. A child taps "Add to home screen" once, gets an icon, and from then on the game opens fullscreen with no browser chrome. Updates are automatic: the next time the app is opened it picks up the newest deployed build, and a stale page that is already open reloads itself at a safe moment.

Only the player page becomes a PWA. The host page is unaffected (the TV gets its own Android TV wrapper in phase 10).

## Read first

`CLAUDE.md` sections: Player notes, Decisions already made (plain TS + DOM, dependency list). Phase 8 must be `done`; everything here requires a secure origin.

## Approach

Hand-written service worker, **no new dependency**. `vite-plugin-pwa` and Workbox would work but add a build plugin and a lot of generated code for something that fits in about 60 lines here. Record this in `DECISIONS.md`; Alex can overrule.

Strategy: **network-first for everything, cache as fallback**. The player page is tiny and the phone is always on the LAN with the server, so serving fresh from the network is the normal case, and the cache only exists so the app still opens (and shows "can't reach the TV") when the server is down. Because it is network-first there is no precache manifest to keep in sync with Vite's hashed filenames; the worker caches whatever it successfully fetches.

## Tasks

### Manifest and icons

- [ ] `packages/web/public/manifest.webmanifest`: `name` and `short_name` "MAKE believe", `start_url: "/"`, `scope: "/"`, `display: "fullscreen"` (fall back to `standalone` if fullscreen misbehaves with the keyboard in the text phase), `orientation: "portrait"`, `background_color`, `theme_color`, icons at 192 and 512 including a `maskable` variant.
- [ ] Icon source as an SVG in the repo (a blob). PNGs generated once with a small Playwright script (already a dependency) and committed under `public/icons/`. Do not add an image library.
- [ ] `index.html` (player only) links the manifest and sets `theme-color`. `host/index.html` does not.

### Service worker

- [ ] `packages/web/public/sw.js` (plain JS, not bundled): install with `skipWaiting`, activate with `clients.claim` and old-cache cleanup, `fetch` handler that is network-first with cache fallback for same-origin GET requests, and ignores `/ws` and `/host/`. Cache name includes the build version so a new build starts a new cache.
- [ ] Build version: Vite injects `__BUILD_VERSION__` (git short SHA or a timestamp) into the player page; the server exposes the same value at `GET /version`. Decide the source and record it.
- [ ] Registration in `src/player/main.ts` with `updateViaCache: 'none'`. On `controllerchange`, reload the page **only if** the player is on the join screen or the "waiting for TV" screen; otherwise set a flag and reload at the next return to those screens. Never reload mid-joystick.
- [ ] On every connect the player fetches `/version` and compares it with its own build version; on mismatch it triggers `registration.update()` and follows the same safe-reload rule. This catches a phone that was left open across a deploy.
- [ ] Wake Lock is requested on join and re-requested on `visibilitychange` (Android drops it when the app is backgrounded).

### Install experience

- [ ] Capture `beforeinstallprompt`; show an "Add to home screen" button on the join screen only when the event fired and the app is not already running in `display-mode: standalone/fullscreen`. Hide it after install (`appinstalled`).
- [ ] Launching from the icon lands on the join screen with the last name pre-filled; the room code still has to be typed or come from the QR.

### Tests

- [ ] Unit test the safe-reload decision as a pure function (current screen, update pending) -> reload now or defer.
- [ ] Unit test the version-compare logic.
- [ ] e2e: extend the phase 6 spec with a check that `/manifest.webmanifest` and `/sw.js` are served with the right content types and that `/version` returns the injected value. Do not try to test installability in Playwright.
- [ ] README: "On your phone" section: scan the QR, tap Add to home screen, that's it.

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Manual check on a real Android phone over `https://`: Chrome offers install; installed app opens fullscreen; deploy a build with a visible change, reopen the app, change is there; leave the app open on the join screen across a deploy and it reloads by itself. Chrome DevTools remote debugging shows the manifest with no installability warnings.

## Handoff

- **State:** not started.
- **Next step:** manifest and icons, then confirm Chrome shows the page as installable before writing the worker.
- **Known issues:** none.
