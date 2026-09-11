import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** The model under `game/`, subdirectories included, stays pure so it can be tested in node. */

const here = dirname(fileURLToPath(import.meta.url))

function sources(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...sources(path))
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found
}

describe('the game model', () => {
  it('imports nothing from Phaser, and nothing from the browser', () => {
    const files = sources(here)
    expect(files.length).toBeGreaterThan(4)

    for (const file of files) {
      const where = relative(here, file)
      const source = readFileSync(file, 'utf8')
      expect(source, `${where} must not import phaser`).not.toMatch(/from ['"]phaser['"]/)
      expect(source, `${where} must not touch the DOM`).not.toMatch(/\b(document|window)\./)
    }
  })

  it('looks inside the subdirectories, not just its own', () => {
    const found = sources(here).map((file) => relative(here, file))

    expect(found).toContain(join('objectives', 'director.ts'))
    expect(found.some((file) => file.includes('/') || file.includes('\\'))).toBe(true)
  })
})
