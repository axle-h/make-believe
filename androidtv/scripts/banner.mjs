import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

/**
 * Renders `blob.svg` into the TV banner and launcher icon. Run by hand when the blob changes; the
 * PNGs are committed, so building the APK needs no Node.
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

// TV launchers do not always print the name underneath, so the banner says it itself.
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

await shoot('mipmap-xhdpi/ic_launcher.png', 192, 192, `<div style="width: 150px;">${blob}</div>`)

await browser.close()
