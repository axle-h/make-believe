import { expect } from '@playwright/test'
import {
  BLOB_SIZE,
  hostRoomCode,
  openTool,
  playerNamed,
  pushJoystick,
  snapshot,
  test,
  worn,
} from './world.js'

/**
 * One evening in front of the TV: two phones scan in, drive their own blobs,
 * say something, and draw — all of it whenever they like, because the session
 * is one continuous game with no rounds. Everything is asserted
 * through the host's model, which is the single source of truth.
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
    // Downwards, into empty floor: driving across would run into Ida, and
    // shoving her is a collision rather than an input going astray.
    await pushJoystick(wilf, { dx: 0, dy: 1 })

    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).y > before.wilf.y + 50)
      .toBe(true)
    const idaNow = await playerNamed(host, 'Ida')
    expect({ x: idaNow.x, y: idaNow.y }).toEqual({ x: before.ida.x, y: before.ida.y })

    // Letting go stops the blob dead.
    const stopped = (await playerNamed(host, 'Wilf')).y
    await host.page.waitForTimeout(300)
    expect((await playerNamed(host, 'Wilf')).y).toBeCloseTo(stopped, 0)

    // --- saying something, without anything having to change on the TV ---
    await openTool(ida, 'say')
    await ida.page.fill('#text-input', 'hello mum')
    await ida.page.click('#text-send')

    await expect.poll(async () => (await playerNamed(host, 'Ida')).text, { timeout: 4_000 }).toBe(
      'hello mum',
    )
    expect((await playerNamed(host, 'Wilf')).text).toBeNull()
    await expect(ida.page.locator('#text-input')).toHaveValue('')

    // Back to the joystick, and Ida can drive with the bubble still up.
    await ida.page.click('#say-close')
    await expect(ida.page.locator('#pad')).toBeVisible()
    expect((await playerNamed(host, 'Ida')).text).toBe('hello mum')

    // The bubble takes itself down again.
    await expect.poll(async () => (await playerNamed(host, 'Ida')).text, { timeout: 12_000 }).toBeNull()

    // --- drawing, from the same continuous session ---
    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    // Sending puts the joystick back up; the TV is where the drawing shows.
    await expect(wilf.page.locator('#sheet-draw')).toBeHidden()

    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).skinKey, { timeout: 8_000 })
      .not.toBeNull()
    const skinKey = (await playerNamed(host, 'Wilf')).skinKey
    expect(skinKey).toMatch(/^skin-.+-1$/)
    // ...and the drawing reached the sprite, not just the model.
    await expect.poll(async () => (await worn(host))[wilf.playerId], { timeout: 8_000 }).toBe(skinKey)
    expect((await playerNamed(host, 'Ida')).skinKey).toBeNull()
  })

  test('a blob can be renamed and redrawn without stopping the game', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs(host.roomCode, 'Wilf')

    // Drive first, so the rename lands in the middle of a game rather than at
    // the start of one.
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 300)
    const before = await playerNamed(host, 'Wilf')

    await openTool(wilf, 'name')
    await wilf.page.fill('#rename-input', 'Sir Wilf')
    await wilf.page.click('#rename-save')
    await expect(wilf.page.locator('#sheet-name')).toBeHidden()

    await expect.poll(async () => (await snapshot(host)).players[0]?.name).toBe('Sir Wilf')
    // The same blob, in the same place, wearing the same colour.
    const renamed = await playerNamed(host, 'Sir Wilf')
    expect(renamed.playerId).toBe(before.playerId)
    expect(renamed.colour).toBe(before.colour)
    expect(renamed.y).toBeCloseTo(before.y, 0)
    expect((await snapshot(host)).players).toHaveLength(1)

    // A second drawing replaces the first, at any time.
    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect.poll(async () => (await playerNamed(host, 'Sir Wilf')).skinKey).toBe(
      `skin-${wilf.playerId}-1`,
    )

    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect
      .poll(async () => (await playerNamed(host, 'Sir Wilf')).skinKey, { timeout: 8_000 })
      .toBe(`skin-${wilf.playerId}-2`)
    await expect
      .poll(async () => (await worn(host))[wilf.playerId], { timeout: 8_000 })
      .toBe(`skin-${wilf.playerId}-2`)

    // ...and the joystick still drives after all that.
    const settled = await playerNamed(host, 'Sir Wilf')
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Sir Wilf')).y).toBeGreaterThan(settled.y + 20)
  })

  test('blobs are solid and shove each other about', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs(host.roomCode, 'Wilf')
    await party.joinAs(host.roomCode, 'Ida')

    const before = await playerNamed(host, 'Ida')
    // Wilf spawns to Ida's left; drive straight into her.
    await pushJoystick(wilf, { dx: 1, dy: 0 }, 900)

    const after = await playerNamed(host, 'Ida')
    expect(after.x).toBeGreaterThan(before.x + 20)
    expect(after.y).toBeCloseTo(before.y, 0)

    // ...and nobody ends up standing inside anybody.
    const wilfNow = await playerNamed(host, 'Wilf')
    expect(Math.abs(after.x - wilfNow.x)).toBeGreaterThanOrEqual(BLOB_SIZE - 1)
  })

  test('a phone opened at the bare URL is sent to the TV to scan', async ({ party }) => {
    const host = await party.openHost()
    const phone = await party.openPhone('/')

    // Nothing to type: there is no code on this phone and nowhere to put one.
    await expect(phone.locator('#screen-scan')).toBeVisible()
    await expect(phone.locator('#screen-join')).toBeHidden()

    // Following the QR code's link is all it takes to get past it.
    await phone.goto(`/?room=${host.roomCode}`)
    await expect(phone.locator('#screen-join')).toBeVisible()
    await phone.fill('#name-input', 'Wilf')
    await phone.click('#join-button')
    await expect(phone.locator('#screen-play')).toBeVisible()
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
    await expect(host.page.locator('#qr svg')).toBeVisible()
    expect(await hostRoomCode(host.page)).toBe(host.roomCode)

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
