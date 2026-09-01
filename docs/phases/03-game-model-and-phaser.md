---
phase: 3
title: Game model and Phaser
status: done
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

- [x] `createGame()` returns initial state: world size 1280x720, empty players, phase `lobby`.
- [x] `applyMessage(state, msg)` handles `join` (spawn at a sane position, assign colour and slot, idempotent for a known `playerId`), `input` (store velocity), `left` (remove), and phase changes. Returns new state or mutates in a documented, consistent way; pick one and record it in `DECISIONS.md`.
- [x] `tick(state, dtMs)` moves players by `velocity * speed * dt` and clamps to world bounds.
- [x] Selectors: players list, player by id, current phase.
- [x] Phase transition rules: which transitions are legal from `lobby`, `play`, `draw`, `text`. Illegal transitions are ignored and the model exposes that it was ignored (return value or error, your choice, record it).
- [x] No Phaser imports anywhere under `game/`. Add a lint rule or a test that greps for `from 'phaser'` under that directory.
- [x] Vitest (node environment): every bullet in `CLAUDE.md` Testing, "web — host game model", except text and drawing which land in phases 4 and 5.

### Phaser layer (`packages/web/src/host/phaser/`)

- [x] Add `phaser` dependency to `packages/web` only. Confirm the player bundle does not include it after `pnpm build` (check `dist` chunk sizes).
- [x] `new Phaser.Game(...)` with the config from `CLAUDE.md` Phaser notes: 1280x720, `Scale.FIT`, `CENTER_BOTH`, arcade physics. (arcade physics deliberately left out: the model moves the blobs, see D-013)
- [x] One scene: `update` calls `tick` and then draws the model. The socket is opened in `main.ts` rather than in `create` so that the connection outlives any scene restart, and positions come from the model rather than from a physics body (D-013).
- [x] Sprites created and destroyed as players join and leave. Name label is a `Text` object repositioned above the sprite each frame.
- [x] Room code and "MAKE believe" heading shown on the Phaser canvas or in surrounding DOM, whichever is simpler; keep it readable from a sofa.
- [x] Expose `window.__game` on the host page returning the current model state (read-only snapshot) for the e2e tests in phase 6.
- [x] Remove the plain-canvas renderer from phase 1.
- [x] Verify each Phaser API used against `node_modules/phaser/types/phaser.d.ts`; Phaser 4 differs from Phaser 3 in places.

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual check: same as phase 2, now rendered by Phaser, with sprites stopping at the world edge.

## Handoff

- **State:** done. The pure model lives in `packages/web/src/host/game/` (`createGame`, `applyMessage`, `tick`, `setPhase`, selectors, `snapshot`) with 41 tests, including one that greps the directory for Phaser and DOM references. The TV renders it with Phaser 4.2.1 in `src/host/phaser/`, the plain canvas is gone, and `window.__game` is now `{ state, snapshot() }`.
- **Next step:** phase 4 — bubbles in the model, then the host's phase shortcuts and the phone's text screen.
- **Known issues:** none. Two things worth knowing: the world's phase now starts at `lobby` and the first join moves it to `play` (D-014), and the model — not arcade physics — is what moves a blob (D-013), which is a deliberate departure from the Phaser notes in the brief.
