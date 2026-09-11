/** The debug menu's keyboard as a pure function; `debug.ts` does the DOM. */

export type DebugAction =
  | { kind: 'none' }
  | { kind: 'open' }
  | { kind: 'close' }
  /** Already wrapped round the ends. */
  | { kind: 'move'; index: number }
  | { kind: 'choose'; index: number }
  | { kind: 'level'; by: number }

/** A closed menu answers to `d` alone, so no stray key reaches the world. */
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

function step(index: number, by: number, count: number): number {
  if (count <= 0) return 0
  return (((index + by) % count) + count) % count
}
