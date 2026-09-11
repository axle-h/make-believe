import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Run by hand whenever `public/icons/blob.svg` changes; the PNGs it writes are committed.

const here = dirname(fileURLToPath(import.meta.url))
const icons = resolve(here, '../public/icons')

const GROUND = '#10121a'

/** A maskable icon may be cropped to a circle, so its blob covers less of the square. */
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
