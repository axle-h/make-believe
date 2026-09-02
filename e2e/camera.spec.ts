import { expect, type Page } from '@playwright/test'
import { snapshot, test } from './world.js'

/**
 * Reading the TV's QR code with the phone's own camera — the way back in for a
 * phone that is open at its icon, where there is no address bar and no getting
 * out to the camera app.
 *
 * Chromium on Linux has no `BarcodeDetector`, so the reader is stubbed: what is
 * under test is the wiring around it — the offer only where it can be taken up,
 * the camera going away again, and a code found being exactly a code scanned.
 * The camera itself is Chromium's fake device (see `playwright.config.ts`).
 */

/** Put a QR reader on the page that sees `value`, or no reader at all. */
async function fakeReader(page: Page, value: string | null): Promise<void> {
  await page.addInitScript((seen) => {
    if (seen === null) {
      Reflect.deleteProperty(window, 'BarcodeDetector')
      return
    }
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class {
        detect() {
          return Promise.resolve([{ rawValue: seen }])
        }
      },
    })
  }, value)
}

test.describe('the phone camera', () => {
  test('finding the TV in the camera is finding the code', async ({ party }) => {
    const host = await party.openHost()
    const phone = await party.openPhone('/')
    // The link the TV is holding up, as the camera would read it off the screen.
    await fakeReader(phone, `${new URL(phone.url()).origin}/?room=${host.roomCode}`)
    await phone.goto('/')

    await expect(phone.locator('#screen-scan')).toBeVisible()
    await phone.click('#scan-camera')
    await expect(phone.locator('#viewfinder')).toBeVisible()

    // Seen. The camera is put away and the phone is asked who it is, exactly as
    // if the QR code had been scanned from outside.
    await expect(phone.locator('#screen-join')).toBeVisible()
    await expect(phone.locator('#viewfinder')).toBeHidden()

    await phone.fill('#name-input', 'Wilf')
    await phone.click('#join-button')
    await expect(phone.locator('#screen-play')).toBeVisible()
    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name))
      .toEqual(['Wilf'])
  })

  test('keeps looking past a QR code that is not the TV', async ({ party }) => {
    await party.openHost()
    const phone = await party.openPhone('/')
    await fakeReader(phone, 'WIFI:S=kitchen;T=WPA;P=hunter2;;')
    await phone.goto('/')

    await phone.click('#scan-camera')
    await expect(phone.locator('#viewfinder')).toBeVisible()
    // Nothing happens, and nothing is complained about: the camera stays open
    // and the next thing it looks at might be the TV.
    await phone.waitForTimeout(1_000)
    await expect(phone.locator('#viewfinder')).toBeVisible()
    await expect(phone.locator('#screen-join')).toBeHidden()

    await phone.click('#viewfinder-close')
    await expect(phone.locator('#viewfinder')).toBeHidden()
    await expect(phone.locator('#screen-scan')).toBeVisible()
  })

  test('offers nothing where the browser cannot read a code', async ({ party }) => {
    await party.openHost()
    const phone = await party.openPhone('/')
    await fakeReader(phone, null)
    await phone.goto('/')

    // The camera app is the way in on these, as it always was. An offer that
    // could not be taken up would be worse than no offer.
    await expect(phone.locator('#screen-scan')).toBeVisible()
    await expect(phone.locator('#scan-camera')).toBeHidden()
  })
})
