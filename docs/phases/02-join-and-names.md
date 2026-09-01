---
phase: 2
title: Join and names
status: done
updated: 2026-09-01
---

# Phase 2 — Join and names

## Goal

Players join through a proper screen that asks for the room code and a name. The name shows as a label above the player's square on the TV. The host page is titled "MAKE believe".

## Read first

`CLAUDE.md` sections: What we're building (feature 2), Message protocol, Player notes.

## Tasks

- [x] Player join screen: room code input (uppercase, 4 chars, validated with `isValidRoomCode`), name input (trimmed, 1 to 16 chars, decide the cap and record it), Join button. Disabled until both are valid. Remembers the last name in localStorage. Cap is 16, already recorded in D-003; `normaliseName`/`isValidName` live in `shared/src/blobName.ts`.
- [x] `join` message carries the real name. Host keeps the name in its per-player record.
- [x] Host canvas draws the name centred above each square.
- [x] Host page `<title>` and a visible heading read "MAKE believe" (keep the capitalisation). Room code remains prominent. (Phase 1 already did this; confirmed, not changed.)
- [x] Player page shows a "waiting for TV" state when it receives `phase: lobby` with no host, and returns to the joystick when the host is back.
- [x] Rejoin with the same `playerId` (page refresh) reattaches to the same square and keeps the name; verify in the relay or host, and add a test for whichever holds that logic. The host holds it: `src/host/blobs.ts`, tested in `blobs.test.ts`.
- [x] Unit tests for any new pure logic (name validation, join-form state).

Added while working:

- [x] Remember the last room code alongside the name, so a refresh rejoins with no typing (D-010). Without it "refreshing a phone keeps its square" meant retyping the code every time.
- [x] A blob whose phone goes away waits on screen, faded, instead of vanishing (D-009). A refresh drops the socket, so deleting on `left` made the square impossible to keep.
- [x] Fix: the relay closed a rejected player socket itself, so the server's `4001` close code and its reason never reached the phone. The relay now leaves it open for the caller to close (D-011). The phone needs that reason to tell "no TV yet" from "stale code".

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All pass: 89 tests across 8 files.

Manual check, done in Chrome against `pnpm build && pnpm start`:

- Two phones joined with different names; both names drew above the right squares.
- A held pad moved only its own blob; the other stayed put.
- Refreshing a phone was a non-event: same slot, colour, name and position, straight back to the joystick with no typing.
- Killing and restarting the server: phones showed "Lost the TV — retrying…", then recovered on their own with the world intact.
- Reloading the TV (a new code): phones fell back to the join screen saying "The TV has a new code now.", keeping the name.
- Closing a phone faded its blob and stopped it dead; it was purged on the frame after its wait ran out.

## Handoff

- **State:** done. Phones join with a code and a name, the TV labels each square, and a phone refresh, a server restart or a TV reload all recover sensibly. The host's state now lives in the pure `src/host/blobs.ts` rather than in `main.ts`.
- **Next step:** phase 3 — grow `src/host/blobs.ts` into the pure game model under `src/host/game/` and swap the plain canvas for Phaser. Keep `window.__game` pointing at the model (D-007).
- **Known issues:** none. Two things for phase 3 to know: `blobs.ts` already holds `tick`, world bounds and the away timeout, so it is the seed of the model rather than something to rewrite; and Phaser's arcade physics will own position, so the `away` flag needs to stop a body rather than just skip a loop.
