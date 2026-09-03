import {
  askFor,
  objectives,
  playerCount,
  setLevel,
  TEMPLATES,
  type GameState,
  type Objective,
} from './game/index.js'
import { debugKey } from './debugMenu.js'

/**
 * The hidden debug menu. Press `d` on a keyboard attached to the TV and a list
 * of every task appears; arrows move, Enter starts one, left and right nudge
 * the ladder, `d` or Escape puts it away.
 *
 * It is the one exception to "the TV takes no input at all", and it is a
 * deliberate one. It exists so that a grown-up can look at the twelfth task
 * without a room of children first climbing eight levels to it, and it is safe
 * to leave switched on: the device this runs on is a stick behind a television
 * with no keyboard, no phone can reach it, and every key but `d` is ignored
 * while it is shut.
 *
 * Nothing in here is game state. It reads the model to draw a list and calls
 * two functions on the director, both of which do exactly what the director
 * does to itself when it starts a task of its own.
 */

/** How the list reads while it is up. */
const TITLE = 'Debug — pick a task'
const HELP = '↑↓ choose · ↵ start · ←→ level · d closes'

export interface DebugMenu {
  /** For tests and for anybody wondering; the page itself never asks. */
  isOpen(): boolean
}

export function startDebugMenu(root: HTMLElement, state: GameState): DebugMenu {
  const panel = document.createElement('div')
  panel.className = 'debug'
  panel.hidden = true

  const heading = document.createElement('p')
  heading.className = 'debug-title'
  heading.textContent = TITLE

  const level = document.createElement('p')
  level.className = 'debug-level'

  const list = document.createElement('ul')
  list.className = 'debug-list'

  const help = document.createElement('p')
  help.className = 'debug-help'
  help.textContent = HELP

  const rows = TEMPLATES.map((template) => {
    const row = document.createElement('li')
    row.className = 'debug-row'
    list.append(row)
    return { row, template }
  })

  panel.append(heading, level, list, help)
  root.append(panel)

  let open = false
  let index = 0

  window.addEventListener('keydown', (event) => {
    // A key with a modifier on it belongs to the browser, not to us.
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const action = debugKey(event.key, open, index, rows.length)
    if (action.kind === 'none') return
    event.preventDefault()

    switch (action.kind) {
      case 'open': {
        open = true
        break
      }
      case 'close': {
        open = false
        break
      }
      case 'move': {
        index = action.index
        break
      }
      case 'level': {
        setLevel(state, objectives(state).level + action.by)
        break
      }
      case 'choose': {
        start(rows[action.index]?.template.kind)
        break
      }
    }
    draw()
  })

  /**
   * Ask the world for this one. A task the room is too small for is refused by
   * the director rather than forced: it says so in the list and leaves whatever
   * is running alone, because a task judged against two children when it needs
   * three is one nobody can finish.
   */
  function start(kind: Objective['kind'] | undefined): void {
    if (!kind) return
    if (askFor(state, kind)) open = false
  }

  function draw(): void {
    panel.hidden = !open
    if (!open) return

    const director = objectives(state)
    const here = playerCount(state)
    level.textContent = `Level ${director.level} · ${here} ${here === 1 ? 'blob' : 'blobs'}`

    for (const [at, { row, template }] of rows.entries()) {
      const enough = here >= template.minPlayers
      const needs = enough ? '' : ` (needs ${template.minPlayers})`
      const said = `${template.title} — from level ${template.minLevel}${needs}`
      if (row.textContent !== said) row.textContent = said
      row.classList.toggle('is-on', at === index)
      row.classList.toggle('is-out', !enough)
    }
  }

  return { isOpen: () => open }
}
