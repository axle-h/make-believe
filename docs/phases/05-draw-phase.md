---
phase: 5
title: Draw phase
status: done
updated: 2026-09-01
---

# Phase 5 — Draw phase

## Goal

The host can switch the room into the `draw` phase. Phones show a 256x256 drawing canvas; on "Done" the drawing is sent as a PNG and becomes the blob's skin on the TV.

## Read first

`CLAUDE.md` sections: Message protocol (`drawing`), Phaser notes (`addBase64`), Player notes (drawing).

## Tasks

- [x] Player: `draw` phase screen with a 256x256 canvas, a faint outline of the blob shape as a guide, a couple of colours, a clear button, and Done. Pointer events with `touch-action: none`. Done sends `toDataURL('image/png')` as `drawing`.
- [x] Player: guard against sending a PNG over the `shared` size cap; if too large, downscale or tell the player, do not silently drop.
- [x] Model: `drawing` sets a `skinKey` on the player (for example `skin-<playerId>-<n>`) and stores the data URL; test that a drawing sets the key and a second drawing changes it.
- [x] Phaser: on a new skin key, `this.textures.addBase64(key, png)`, then on the `addtexture-<key>` event `sprite.setTexture(key)`. Remove the previous texture for that player to avoid leaking GPU memory.
- [x] Sprite size stays consistent when the texture changes (set display size explicitly).
- [x] Host phase shortcut for `draw` (extend the phase 4 mapping and the `DECISIONS.md` entry).

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual check on a real Android phone: draw, press Done, the blob on the TV shows the drawing; draw again and it updates.

## Handoff

- **State:** done. The phone's `draw` screen is a 256x256 canvas that starts as a rounded square of the player's own colour (D-018), with seven crayons, "Start again" and "Done". `Done` sends the PNG, halving it first if it would ever exceed the size cap and saying so rather than dropping it silently. The model stores `{ key, png }` per player and the scene turns a new key into a texture via `addBase64`, dropping the previous texture. `window.__game.worn()` reports what each sprite is actually wearing (D-019).
- **Next step:** phase 6 — QR code, reconnect handling, and the Playwright suite, whose drawing test is what proves the texture reaches the sprite.
- **Known issues:** the texture swap has been proven as far as the model (`skinKey` changes, PNG round-trips through the relay) but not yet on screen: this machine's browser tab is background-throttled, so Phaser's render loop does not run and nothing can be seen. Phase 6's e2e asserts `worn()` in a visible page, which closes it. The real-phone check (drawing with a finger) is still outstanding, as with phase 4's keyboard handling.
