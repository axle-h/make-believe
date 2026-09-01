# docs/ — implementation plan and working state

This folder is the shared workspace between Alex and the coding agents building MAKE believe. It holds the phased plan and, more importantly, the **current state of the work**, so that any agent (or human) can pick up exactly where the last one left off.

`CLAUDE.md` at the repo root is the design brief. It says *what* to build and lists decisions that are already made. This folder says *in what order*, and *where we are*. If the two ever conflict, `CLAUDE.md` wins and the plan should be corrected.

## Files

| File | Purpose | Who edits it |
|---|---|---|
| `README.md` | This file. The protocol. | Alex only |
| `PLAN.md` | Phase index with one-line status per phase. The dashboard. | Agents, to update status |
| `phases/NN-name.md` | One file per phase: goal, task checklist, acceptance criteria, handoff notes. | Agents, freely within the rules below |
| `LOG.md` | Append-only work log, one entry per session. | Agents, append only |
| `DECISIONS.md` | Numbered record of decisions made *during* implementation that `CLAUDE.md` does not cover. | Agents, append only |

## Protocol

### At the start of every session

1. Read this file.
2. Read `PLAN.md` and find the phase marked `in-progress`. If none is, the next `not-started` phase in order is yours.
3. Read that phase file in full, especially its **Handoff** section.
4. Read the last three entries in `LOG.md` and skim `DECISIONS.md`.
5. Run the acceptance commands of the *previous* phase to confirm the tree is in the state the handoff claims. If it is not, fix that first and log it.

### While working

- Work **one phase at a time, in order**. Do not start phase N+1 until phase N's acceptance criteria all pass.
- Work through the phase's task checklist top to bottom unless a task is blocked. Mark tasks as you go, not at the end.
- Tests are written in the same change as the code they cover (see `CLAUDE.md`, Testing).
- Keep to the dependency list in `CLAUDE.md`. If you believe a new dependency is needed, mark the task `[!]` blocked with the reason and stop; do not add it.
- If you make a design choice the brief does not cover, add an entry to `DECISIONS.md` before moving on.
- Do **not** commit, push, branch, reset, or otherwise touch git history unless Alex explicitly asks. Leave changes in the working tree.

### Task status tokens

Every task in a phase checklist carries exactly one of these:

| Token | Meaning |
|---|---|
| `- [ ]` | not started |
| `- [~]` | in progress |
| `- [x]` | done, and verified by the acceptance command that covers it |
| `- [!]` | blocked; the reason follows on the same line after `BLOCKED:` |

Tasks under a heading named **Stretch** do not gate the phase's `done` status; everything else does. Tasks may be split into sub-tasks (indented checkboxes) or reworded for clarity. Tasks may be added if something turns out to be necessary. Tasks must not be deleted; if one becomes unnecessary, mark it `[x]` and append `(dropped: reason)`.

### Phase status

Each phase file has a YAML front-matter block:

```yaml
---
phase: 3
title: Game model and Phaser
status: not-started   # not-started | in-progress | done | blocked
updated: 2026-09-01   # date of last edit to this file
---
```

The front-matter is the source of truth. The table in `PLAN.md` mirrors it; update both in the same change. Only one phase may be `in-progress` at a time. A phase becomes `done` only when every task is `[x]` and every acceptance command passes from a clean `pnpm install`.

### Handoff section

The last section of every phase file is `## Handoff`. Overwrite it (do not append to it) at the end of each session with:

- **State:** what works right now, in one or two sentences.
- **Next step:** the single concrete thing the next session should do first.
- **Known issues:** anything broken, flaky, or hacky that a future session must know about. Write `none` if none.

### Log entries

Append to `LOG.md` at the end of every session, newest at the bottom:

```
## 2026-09-01 — phase 1 — <agent or model name>
- Did: ...
- Verified: <which acceptance commands were run and passed>
- Next: ...
```

Keep entries short. The phase file's checklist and Handoff carry the detail; the log is the timeline.

### Ending a session

Before you stop, in this order:

1. Update task tokens in the phase file.
2. Overwrite the phase's Handoff section.
3. Update `status` and `updated` in the front-matter, and the row in `PLAN.md`.
4. Append a `LOG.md` entry.

A session that ends without these four things done has not ended cleanly. If you are running out of context, do them *before* finishing the current task, not after.
