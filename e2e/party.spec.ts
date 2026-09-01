import { expect } from '@playwright/test'
import { playerNamed, pressPhaseKey, pushJoystick, snapshot, test, worn } from './world.js'

/**
 * One evening in front of the TV: two phones join by code, drive their own
 * blobs, say something, and draw. Everything is asserted through the host's
 * model, which is the single source of truth for the whole game.
 */
test.describe('a party', () => {
  test('two phones join, drive, talk and draw', async ({ party }) => {
    const host = await party.openHost()
    await expect(host.page.locator('#qr svg')).toBeVisible()

    const wilf = await party.joinAs(host.roomCode, 'Wilf')
    const ida = await party.joinAs(host.roomCode, 'Ida')

    // --- both blobs are on the TV, with their names ---
    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name))
      .toEqual(['Wilf', 'Ida'])

    const before = {
      wilf: await playerNamed(host, 'Wilf'),
      ida: await playerNamed(host, 'Ida'),
    }
    expect(before.wilf.colour).not.toBe(before.ida.colour)

    // --- a joystick moves only its own blob ---
    await pushJoystick(wilf, { dx: 1, dy: 0 })

    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).x > before.wilf.x + 50)
      .toBe(true)
    const idaNow = await playerNamed(host, 'Ida')
    expect({ x: idaNow.x, y: idaNow.y }).toEqual({ x: before.ida.x, y: before.ida.y })

    // Letting go stops the blob dead.
    const stopped = (await playerNamed(host, 'Wilf')).x
    await host.page.waitForTimeout(300)
    expect((await playerNamed(host, 'Wilf')).x).toBeCloseTo(stopped, 0)

    // --- the text round ---
    await pressPhaseKey(host, 'T')
    await expect(ida.page.locator('#screen-text')).toBeVisible()
    await expect(wilf.page.locator('#screen-text')).toBeVisible()

    await ida.page.fill('#text-input', 'hello mum')
    await ida.page.click('#text-send')

    await expect.poll(async () => (await playerNamed(host, 'Ida')).text, { timeout: 4_000 }).toBe(
      'hello mum',
    )
    expect((await playerNamed(host, 'Wilf')).text).toBeNull()
    await expect(ida.page.locator('#text-input')).toHaveValue('')

    // The bubble takes itself down again.
    await expect.poll(async () => (await playerNamed(host, 'Ida')).text, { timeout: 12_000 }).toBeNull()

    // --- the drawing round ---
    await pressPhaseKey(host, 'P')
    await expect(wilf.page.locator('#screen-play')).toBeVisible()
    await pressPhaseKey(host, 'D')
    await expect(wilf.page.locator('#screen-draw')).toBeVisible()

    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect(wilf.page.locator('#draw-status')).toHaveText('Sent to the TV')

    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).skinKey, { timeout: 8_000 })
      .not.toBeNull()
    const skinKey = (await playerNamed(host, 'Wilf')).skinKey
    expect(skinKey).toMatch(/^skin-.+-1$/)
    // ...and the drawing reached the sprite, not just the model.
    await expect.poll(async () => (await worn(host))[wilf.playerId], { timeout: 8_000 }).toBe(skinKey)
    expect((await playerNamed(host, 'Ida')).skinKey).toBeNull()
  })

  test('a phone that reloads keeps its blob', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs(host.roomCode, 'Wilf')

    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    const before = await playerNamed(host, 'Wilf')

    await wilf.page.reload()
    // Nothing to retype: the phone remembers who and where it is.
    await expect(wilf.page.locator('#screen-play')).toBeVisible()

    const after = await playerNamed(host, 'Wilf')
    expect(after.playerId).toBe(before.playerId)
    expect(after.slot).toBe(before.slot)
    expect(after.colour).toBe(before.colour)
    expect(after.y).toBeCloseTo(before.y, 0)
    expect((await snapshot(host)).players).toHaveLength(1)
  })

  test('the TV can be reloaded and the phones carry on', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs(host.roomCode, 'Wilf')
    await expect.poll(async () => (await snapshot(host)).players.length).toBe(1)

    await host.page.reload()
    // Same session, so the code on the phones still works.
    await expect(host.page.locator('#room-code')).toHaveText(host.roomCode)

    // The phone knocks again on its own; nobody touches it.
    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name), {
        timeout: 15_000,
      })
      .toEqual(['Wilf'])
    await expect(wilf.page.locator('#screen-play')).toBeVisible()
  })
})

/** A few strokes on the drawing canvas, as a finger would make them. */
async function scribble(page: import('@playwright/test').Page): Promise<void> {
  const canvas = page.locator('#draw-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('the drawing canvas has no box')
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.45, { steps: 10 })
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.75, { steps: 10 })
  await page.mouse.up()
}
