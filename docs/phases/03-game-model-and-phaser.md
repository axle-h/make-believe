---
phase: 3
title: Game model and Phaser
status: not-started
updated: 2026-09-01
---

# Phase 3 — Game model and Phaser

## Goal

Introduce the pure TypeScript game model with its tests, then replace the plain canvas on the host with Phaser 4. After this phase the Phaser layer is a thin renderer over the model, which is the arrangement every later phase builds on.

Do the model first and get its tests green before touching Phaser.

## Read first

`CLAUDE.md` sections: Testing (web, host game model), Phaser notes, Decisions already made (Phaser 4, not Editor or Agent).

## Tasks

### Game model (`packages/web/src/host/game/`)

- [ ] `createGame()` returns initial state: world size 1280x720, empty players, phase `lobby`.
- [ ] `applyMessage(state, msg)` handles `join` (spawn at a sane position, assign colour and slot, idempotent for a known `playerId`), `input` (store velocity), `left` (remove), and phase changes. Returns new state or mutates in a documented, consistent way; pick one and record it in `DECISIONS.md`.
- [ ] `tick(state, dtMs)` moves players by `velocity * speed * dt` and clamps to world bounds.
- [ ] Selectors: players list, player by id, current phase.
- [ ] Phase transition rules: which transitions are legal from `lobby`, `play`, `draw`, `text`. Illegal transitions are ignored and the model exposes that it was ignored (return value or error, your choice, record it).
- [ ] No Phaser imports anywhere under `game/`. Add a lint rule or a test that greps for `from 'phaser'` under that directory.
- [ ] Vitest (node environment): every bullet in `CLAUDE.md` Testing, "web — host game model", except text and drawing which land in phases 4 and 5.

### Phaser layer (`packages/web/src/host/phaser/`)

- [ ] Add `phaser` dependency to `packages/web` only. Confirm the player bundle does not include it after `pnpm build` (check `dist` chunk sizes).
- [ ] `new Phaser.Game(...)` with the config from `CLAUDE.md` Phaser notes: 1280x720, `Scale.FIT`, `CENTER_BOTH`, arcade physics.
- [ ] One scene: `create` opens the WebSocket and feeds messages into the model; `update` calls `tick`, then for each player sprite calls `setVelocity` from the model's velocity and `setCollideWorldBounds(true)`. Do not hand-roll movement in Phaser.
- [ ] Sprites created and destroyed as players join and leave. Name label is a `Text` object repositioned above the sprite each frame.
- [ ] Room code and "MAKE believe" heading shown on the Phaser canvas or in surrounding DOM, whichever is simpler; keep it readable from a sofa.
- [ ] Expose `window.__game` on the host page returning the current model state (read-only snapshot) for the e2e tests in phase 6.
- [ ] Remove the plain-canvas renderer from phase 1.
- [ ] Verify each Phaser API used against `node_modules/phaser/types/phaser.d.ts`; Phaser 4 differs from Phaser 3 in places.

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual check: same as phase 2, now rendered by Phaser, with sprites stopping at the world edge.

## Handoff

- **State:** not started.
- **Next step:** write `createGame`, `applyMessage`, `tick` with tests before adding the Phaser dependency.
- **Known issues:** none.
