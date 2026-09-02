import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

/**
 * Turns `public/icons/blob.svg` into the PNGs the manifest asks for.
 *
 * Run by hand — `node packages/web/scripts/icons.mjs` — whenever the blob
 * changes; the PNGs it writes are committed. Playwright is already a
 * dependency for the e2e suite, so this needs no image library.
 */

const here = dirname(fileURLToPath(import.meta.url))
const icons = resolve(here, '../public/icons')

/** The ground the blob sits on, matching the player page's background. */
const GROUND = '#10121a'

/**
 * How much of the square the blob covers. A maskable icon may be cropped to a
 * circle by the launcher, so it keeps everything well inside the safe zone.
 */
const SIZES = [
  { file: 'icon-192.png', size: 192, cover: 0.78 },
  { file: 'icon-512.png', size: 512, cover: 0.78 },
  { file: 'icon-512-maskable.png', size: 512, cover: 0.56 },
]

const blob = await readFile(resolve(icons, 'blob.svg'), 'utf8')
const browser = await chromium.launch()

async function render({ file, size, cover }) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`
    <style>
      html, body { margin: 0; height: 100%; }
      body { background: ${GROUND}; display: grid; place-items: center; }
      svg { width: ${Math.round(size * cover)}px; height: auto; }
    </style>
    ${blob}
  `)
  await writeFile(resolve(icons, file), await page.screenshot())
  await page.close()
  console.log(`[icons] ${file} (${size}px, blob at ${Math.round(cover * 100)}%)`)
}

await Promise.all(SIZES.map(render))
await browser.close()
