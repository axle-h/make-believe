---
phase: 2
title: Join and names
status: not-started
updated: 2026-09-01
---

# Phase 2 — Join and names

## Goal

Players join through a proper screen that asks for the room code and a name. The name shows as a label above the player's square on the TV. The host page is titled "MAKE believe".

## Read first

`CLAUDE.md` sections: What we're building (feature 2), Message protocol, Player notes.

## Tasks

- [ ] Player join screen: room code input (uppercase, 4 chars, validated with `isValidRoomCode`), name input (trimmed, 1 to 16 chars, decide the cap and record it), Join button. Disabled until both are valid. Remembers the last name in localStorage.
- [ ] `join` message carries the real name. Host keeps the name in its per-player record.
- [ ] Host canvas draws the name centred above each square.
- [ ] Host page `<title>` and a visible heading read "MAKE believe" (keep the capitalisation). Room code remains prominent.
- [ ] Player page shows a "waiting for TV" state when it receives `phase: lobby` with no host, and returns to the joystick when the host is back.
- [ ] Rejoin with the same `playerId` (page refresh) reattaches to the same square and keeps the name; verify in the relay or host, and add a test for whichever holds that logic.
- [ ] Unit tests for any new pure logic (name validation, join-form state).

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual check: two phones join with different names; both names appear above the right squares; refreshing a phone keeps its square and name.

## Handoff

- **State:** not started.
- **Next step:** build the join screen on the player page.
- **Known issues:** none.
