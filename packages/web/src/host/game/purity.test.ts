import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The game model is pure TypeScript. Phaser needs a canvas and a GPU, so the
 * moment an import of it appears under `game/` the model stops being testable
 * in node — which is the whole arrangement the rest of the app is built on.
 */

const here = dirname(fileURLToPath(import.meta.url))

describe('the game model', () => {
  it('imports nothing from Phaser, and nothing from the browser', () => {
    const files = readdirSync(here).filter((name) => name.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(4)

    for (const file of files) {
      const source = readFileSync(join(here, file), 'utf8')
      expect(source, `${file} must not import phaser`).not.toMatch(/from ['"]phaser['"]/)
      expect(source, `${file} must not touch the DOM`).not.toMatch(/\b(document|window)\./)
    }
  })
})
