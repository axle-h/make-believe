---
phase: 4
title: Text phase
status: done
updated: 2026-09-01
---

# Phase 4 — Text phase

## Goal

The host can switch the room into the `text` phase. Phones then show a text input; what a player submits appears as a speech bubble above their blob on the TV for a few seconds and then fades.

## Read first

`CLAUDE.md` sections: Message protocol (`text`, `phase`), Phaser notes (speech bubbles), Player notes (mobile keyboards).

## Tasks

- [x] Host: a way to change phase. For now a keyboard shortcut on the host page (for example `T` for text, `P` for play, `L` for lobby) is enough; record the mapping in `DECISIONS.md`. Sends `phase` to `'*'`.
- [x] Model: `text` message creates a bubble on the player with an expiry; `tick` removes bubbles whose time has run out. Tests: bubble appears, bubble expires after N ms of ticks, a new text replaces the old bubble.
- [x] Model: `text` is ignored when the phase is not `text` or `play` (decide which, record it).
- [x] Player: on `phase: text` show a single-line input (max 60 chars, counter shown) and a Send button; on `phase: play` return to the joystick. The input must not be obscured by the mobile keyboard; use `visualViewport` or a scroll-into-view and test on a real Android phone. (the box asks for focus on arrival and scrolls itself back into view on every `visualViewport` resize — **still to be tried on a real Android phone**)
- [x] Phaser: speech bubble drawn as a `Text` over a rounded rectangle, positioned above the name label each frame, faded out with a tween then destroyed when the model drops the bubble.
- [x] `shared` schema already caps `text` at 60 chars; confirm the server drops longer messages (existing test) and the player trims before sending.

## Acceptance

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual check: press the text shortcut on the host; phone shows the input; sent text appears above the right blob and disappears after the timeout.

## Handoff

- **State:** done. `P`/`T`/`D`/`L` on the TV change phase and the current one is shown along the bottom. A `text` message puts a bubble on the model with a 6 second life (`BUBBLE_MS`), `tick` counts it down, and Phaser draws it as a rounded box with a tail above the name, fading out when the model drops it. The phone shows a text box with a counter during a `text` round and goes back to the joystick on `play`.
- **Next step:** phase 5 — the drawing screen on the phone.
- **Known issues:** the mobile-keyboard handling (focus, then `scrollIntoView` on every `visualViewport` resize) has only been checked in a desktop browser. It needs trying on a real Android phone, which is the one thing in this phase a laptop cannot prove.
