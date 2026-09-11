import { SAFE_GLYPHS } from '@make-believe/shared'
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
 * The hidden debug menu: `d` is the only key the TV answers, and no phone can
 * reach it. It holds no game state; it calls `askFor` and `setLevel`, which
 * do what the director does to itself.
 */

const TITLE = 'Debug — pick a task'
const HELP = '↑↓ choose · ↵ start · ←→ level · d closes'
/**
 * The panel draws all of `SAFE_GLYPHS`: a test says a glyph is allowed, only the
 * TV says it renders, so a box here means that glyph comes off the list.
 */
const SHEET = 'Glyphs (any box comes off the list):'

export interface DebugMenu {
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

  const sheetLabel = document.createElement('p')
  sheetLabel.className = 'debug-help'
  sheetLabel.textContent = SHEET

  const sheet = document.createElement('p')
  sheet.className = 'debug-glyphs'
  sheet.textContent = SAFE_GLYPHS.join(' ')

  const rows = TEMPLATES.map((template) => {
    const row = document.createElement('li')
    row.className = 'debug-row'
    list.append(row)
    return { row, template }
  })

  panel.append(heading, level, list, help, sheetLabel, sheet)
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

  /** The director refuses a task the room is too small for, and the menu stays open. */
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
