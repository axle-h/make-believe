/**
 * The hidden debug menu on the TV, as a pure function of a keystroke.
 *
 * The TV takes no input during play — no keyboard, no remote, nothing to click
 * — and that rule is what makes six phones the whole of the controls. This is
 * the one deliberate exception: a grown-up with a keyboard wanting to see the
 * twelfth task without a room of children climbing eight levels to it first.
 *
 * It is hidden because it is not part of the game. It opens on `d` and on
 * nothing else, the Fire TV it runs on has no keyboard at all, and a child
 * cannot reach it from a phone under any circumstances.
 *
 * Everything here is a pure function so it can be tested without a DOM; `debug.ts`
 * does the elements and the keys.
 */

/** What a keystroke means. `none` is every key this menu has no use for. */
export type DebugAction =
  | { kind: 'none' }
  | { kind: 'open' }
  | { kind: 'close' }
  /** Somewhere else in the list, already wrapped round the ends. */
  | { kind: 'move'; index: number }
  /** Start the task at this index. */
  | { kind: 'choose'; index: number }
  /** Nudge the ladder, up or down. */
  | { kind: 'level'; by: number }

/**
 * What this key does. `open` is the state the menu is already in, `index`
 * where the highlight is, and `count` how many tasks there are to pick from.
 *
 * A closed menu answers to exactly one key, so nothing a keyboard does by
 * accident — a cat, a remote with a keypad, a laptop lid — can reach the
 * world. An open one swallows the keys it uses and lets the rest past.
 */
export function debugKey(key: string, open: boolean, index: number, count: number): DebugAction {
  if (!open) return key === 'd' ? { kind: 'open' } : { kind: 'none' }

  switch (key) {
    case 'd':
    case 'Escape': {
      return { kind: 'close' }
    }
    case 'ArrowDown': {
      return { kind: 'move', index: step(index, 1, count) }
    }
    case 'ArrowUp': {
      return { kind: 'move', index: step(index, -1, count) }
    }
    case 'ArrowRight':
    case '+':
    case '=': {
      return { kind: 'level', by: 1 }
    }
    case 'ArrowLeft':
    case '-':
    case '_': {
      return { kind: 'level', by: -1 }
    }
    case 'Enter':
    case ' ': {
      return { kind: 'choose', index }
    }
    default: {
      return { kind: 'none' }
    }
  }
}

/**
 * The next index along, wrapping at both ends. A list that stops dead at the
 * bottom makes somebody hunting for the last task press Down twelve times and
 * then wonder whether the key is working.
 */
function step(index: number, by: number, count: number): number {
  if (count <= 0) return 0
  return (((index + by) % count) + count) % count
}
