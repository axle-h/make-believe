import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

/**
 * Turns `packages/web/public/icons/blob.svg` into the two images the TV app
 * needs: the 320x180 banner the leanback launcher shows, and a launcher icon
 * for everywhere else.
 *
 * Run by hand — `node androidtv/scripts/banner.mjs` — whenever the blob
 * changes; the PNGs it writes are committed, so building the APK needs no
 * Node at all. Same approach, and same source image, as the phone's icons in
 * `packages/web/scripts/icons.mjs`.
 */

const here = dirname(fileURLToPath(import.meta.url))
const res = resolve(here, '../app/src/main/res')
const blob = await readFile(resolve(here, '../../packages/web/public/icons/blob.svg'), 'utf8')

/** The two colours the web pages use. */
const GROUND = '#10121a'
const INK = '#f4f1ea'

const browser = await chromium.launch()

async function shoot(file, width, height, body) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(`
    <style>
      html, body { margin: 0; height: 100%; }
      body {
        background: ${GROUND};
        color: ${INK};
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, sans-serif;
      }
      svg { display: block; }
    </style>
    ${body}
  `)
  await writeFile(resolve(res, file), await page.screenshot())
  await page.close()
  console.log(`[banner] ${file} (${width}x${height})`)
}

/*
 * The banner is the app on the TV home screen, and TV launchers do not always
 * print the name underneath — so the banner says it itself. 320x180 at xhdpi
 * is what Android TV asks for.
 */
await shoot(
  'drawable-xhdpi/banner.png',
  320,
  180,
  `<div style="display: flex; align-items: center; gap: 18px;">
     <div style="width: 84px;">${blob}</div>
     <div style="font-size: 30px; line-height: 1.15; letter-spacing: 0.02em;">
       <div style="font-weight: 800;">MAKE</div>
       <div style="font-weight: 300; opacity: 0.85;">believe</div>
     </div>
   </div>`,
)

/* The plain icon, for launchers that want one as well as the banner. */
await shoot('mipmap-xhdpi/ic_launcher.png', 192, 192, `<div style="width: 150px;">${blob}</div>`)

await browser.close()
