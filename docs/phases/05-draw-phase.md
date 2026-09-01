---
phase: 5
title: Draw phase
status: not-started
updated: 2026-09-01
---

# Phase 5 — Draw phase

## Goal

The host can switch the room into the `draw` phase. Phones show a 256x256 drawing canvas; on "Done" the drawing is sent as a PNG and becomes the blob's skin on the TV.

## Read first

`CLAUDE.md` sections: Message protocol (`drawing`), Phaser notes (`addBase64`), Player notes (drawing).

## Tasks

- [ ] Player: `draw` phase screen with a 256x256 canvas, a faint outline of the blob shape as a guide, a couple of colours, a clear button, and Done. Pointer events with `touch-action: none`. Done sends `toDataURL('image/png')` as `drawing`.
- [ ] Player: guard against sending a PNG over the `shared` size cap; if too large, downscale or tell the player, do not silently drop.
- [ ] Model: `drawing` sets a `skinKey` on the player (for example `skin-<playerId>-<n>`) and stores the data URL; test that a drawing sets the key and a second drawing changes it.
- [ ] Phaser: on a new skin key, `this.textures.addBase64(key, png)`, then on the `addtexture-<key>` event `sprite.setTexture(key)`. Remove the previous texture for that player to avoid leaking GPU memory.
- [ ] Sprite size stays consistent when the texture changes (set display size explicitly).
- [ ] Host phase shortcut for `draw` (extend the phase 4 mapping and the `DECISIONS.md` entry).

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual check on a real Android phone: draw, press Done, the blob on the TV shows the drawing; draw again and it updates.

## Handoff

- **State:** not started.
- **Next step:** build the drawing screen on the player page.
- **Known issues:** none.
