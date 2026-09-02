import { expect } from '@playwright/test'
import {
  BLOB_SIZE,
  dropSocket,
  hostSession,
  objectiveNow,
  openTool,
  playerIdNow,
  playerNamed,
  pushJoystick,
  snapshot,
  solveTheSpot,
  test,
  worn,
} from './world.js'

/**
 * One evening in front of the TV: two phones open the page, drive their own
 * blobs, say something, and draw — all of it whenever they like, because the
 * session is one continuous game with no rounds. Everything is asserted
 * through the host's model, which is the single source of truth.
 */
test.describe('a party', () => {
  test('two phones join, drive, talk and draw', async ({ party }) => {
    const host = await party.openHost()
    await expect(host.page.locator('#qr svg')).toBeVisible()

    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

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
    const wilf = await party.joinAs('Wilf')

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
    const wilf = await party.joinAs('Wilf')
    await party.joinAs('Ida')

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

  /**
   * The whole of getting in. A phone that has never been here opens the
   * address and is asked one thing; there is no code to carry over from the
   * TV, and therefore nothing for an installed phone to have to scan for.
   */
  test('a phone opened at the bare URL is asked for a name and nothing else', async ({ party }) => {
    await party.openHost()
    const phone = await party.openPhone('/')

    await expect(phone.locator('#screen-join')).toBeVisible()
    await phone.fill('#name-input', 'Wilf')
    await phone.click('#join-button')
    await expect(phone.locator('#screen-play')).toBeVisible()

    // And next time there is not even that: the name is remembered, so opening
    // the page is the whole of it.
    await phone.goto('/')
    await expect(phone.locator('#screen-play')).toBeVisible()
  })

  test('a phone that reloads keeps its blob', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

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

  /**
   * A reloaded TV is a new world with a new session, and every phone on it is
   * told so. Each one throws away the identity it had — it belonged to a world
   * that no longer exists — and comes straight back as a new player under the
   * same name, with nobody touching it.
   */
  test('a TV that reloads brings its phones back as new players', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    await expect.poll(async () => (await snapshot(host)).players.length).toBe(1)

    await host.page.reload()
    await expect(host.page.locator('#qr svg')).toBeVisible()
    await expect.poll(() => hostSession(host.page)).not.toBe(host.session)

    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name), {
        timeout: 15_000,
      })
      .toEqual(['Wilf'])
    await expect(wilf.page.locator('#screen-play')).toBeVisible()

    // Somebody new, on the same phone, under the same name — and driveable.
    const back = await playerNamed(host, 'Wilf')
    expect(back.playerId).not.toBe(wilf.playerId)
    expect(await playerIdNow(wilf.page)).toBe(back.playerId)
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeGreaterThan(back.y + 20)
  })

  test('a phone that drops off comes back as who it is now, not who it was', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

    await openTool(wilf, 'name')
    await wilf.page.fill('#rename-input', 'Sir Wilf')
    await wilf.page.click('#rename-save')
    await expect.poll(async () => (await snapshot(host)).players[0]?.name).toBe('Sir Wilf')

    // Out of wifi and back again, which is a phone's most ordinary disaster.
    // The phone reconnects on its own, with nobody touching it.
    await dropSocket(wilf)
    await expect(wilf.page.locator('#screen-play')).toBeVisible()

    // The hello it sends on the way back carries the name it has now. Saying
    // the one it opened the socket with would rename the blob back to it.
    await expect.poll(async () => (await snapshot(host)).players[0]?.away, { timeout: 15_000 }).toBe(
      false,
    )
    await wilf.page.waitForTimeout(1_000)
    expect((await snapshot(host)).players.map((player) => player.name)).toEqual(['Sir Wilf'])

    // ...and it is the same blob, still driveable.
    const settled = await playerNamed(host, 'Sir Wilf')
    expect(settled.playerId).toBe(wilf.playerId)
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Sir Wilf')).y).toBeGreaterThan(settled.y + 20)
  })

  test('a TV that forgets everything gets the drawings back from the phones', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

    await openTool(wilf, 'name')
    await wilf.page.fill('#rename-input', 'Sir Wilf')
    await wilf.page.click('#rename-save')
    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect.poll(async () => (await playerNamed(host, 'Sir Wilf')).skinKey).toBe(
      `skin-${wilf.playerId}-1`,
    )

    // The phone reloads too, so what comes back can only have come from
    // storage rather than from a variable that happened to survive.
    await wilf.page.reload()
    await expect(wilf.page.locator('#screen-play')).toBeVisible()

    // A reloaded TV is a brand new world: a new session, and it has never
    // heard of this blob. The phone comes back as somebody new, still holding
    // the only copy of its own picture.
    await host.page.reload()
    await expect(host.page.locator('#qr svg')).toBeVisible()

    // It says who it is and puts its picture back up, with nobody touching it.
    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name), {
        timeout: 20_000,
      })
      .toEqual(['Sir Wilf'])
    const reborn = await playerIdNow(wilf.page)
    expect(reborn).not.toBe(wilf.playerId)
    await expect
      .poll(async () => (await playerNamed(host, 'Sir Wilf')).skinKey, { timeout: 20_000 })
      .toBe(`skin-${reborn}-1`)
    await expect
      .poll(async () => (await worn(host))[reborn as string], { timeout: 10_000 })
      .toBe(`skin-${reborn}-1`)

    // ...and only once: the TV says it has the drawing, so nobody sends it again.
    await wilf.page.waitForTimeout(3_000)
    expect((await playerNamed(host, 'Sir Wilf')).skinKey).toBe(`skin-${reborn}-1`)
  })
})

/**
 * Something to actually do. The world asks for it on its own, both phones are
 * told the same thing above joysticks that never stop working, the children
 * solve it by driving, and the score goes up. Nobody presses start, nobody
 * waits a turn, and nothing on any phone is taken away while it runs.
 */
test.describe('an objective', () => {
  test('appears on its own, is told to every phone, and can be solved by driving', async ({
    party,
  }) => {
    test.setTimeout(120_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    // One blob is not enough for anything; the second makes a task appear with
    // nobody pressing anything at all.
    await expect.poll(async () => (await objectiveNow(host))?.kind, { timeout: 15_000 }).toBe(
      'onTheSpot',
    )
    const objective = await objectiveNow(host)
    const spot = objective?.zones[0]
    if (!objective || !spot) throw new Error('expected a spot on the floor')

    // The same line on both phones, and the controller underneath it untouched.
    await expect(wilf.page.locator('#brief-headline')).toHaveText(objective.headline)
    await expect(ida.page.locator('#brief-headline')).toHaveText(objective.headline)
    await expect(wilf.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'name']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(wilf.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    // A phone arriving halfway through is told what is going on, unasked.
    const ted = await party.joinAs('Ted')
    await expect(ted.page.locator('#brief-headline')).toHaveText(objective.headline)

    // ...and can still do everything else while the task runs.
    await openTool(ted, 'say')
    await ted.page.fill('#text-input', 'where is it')
    await ted.page.click('#text-send')
    await ted.page.click('#say-close')
    await expect.poll(async () => (await playerNamed(host, 'Ted')).text).toBe('where is it')

    // Start watching the phone before they solve it: the cheer is only up for
    // a moment before the next task takes its place.
    const cheered = expect(wilf.page.locator('#brief')).toHaveAttribute('data-tone', 'win', {
      timeout: 90_000,
    })

    // Everybody drives onto it, which is the whole of solving it.
    await solveTheSpot(host, [wilf, ida, ted])
    expect((await snapshot(host)).objectives.score).toBeGreaterThan(0)
    await cheered

    // And a new one turns up behind it, without anybody touching anything.
    await expect
      .poll(async () => (await objectiveNow(host))?.id, { timeout: 30_000 })
      .not.toBe(objective.id)
    await expect.poll(async () => (await objectiveNow(host))?.outcome, { timeout: 30_000 }).toBe(
      'running',
    )

    // The joystick drives exactly as it did before any of that.
    const settled = await playerNamed(host, 'Wilf')
    await pushJoystick(wilf, { dx: 0, dy: -1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeLessThan(settled.y - 20)
  })

  /**
   * A room too empty for a task is not a failure state. Nothing is asked for,
   * the phone says why, and the joystick still drives a blob about the floor.
   */
  test('waits quietly for another blob, without stopping the one that is here', async ({
    party,
  }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

    await expect(wilf.page.locator('#brief-headline')).toHaveText('Waiting for another blob…')
    expect(await objectiveNow(host)).toBeNull()

    const before = await playerNamed(host, 'Wilf')
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeGreaterThan(before.y + 20)

    // A second phone, and the world has something to ask for.
    await party.joinAs('Ida')
    await expect.poll(async () => (await objectiveNow(host))?.kind, { timeout: 15_000 }).toBe(
      'onTheSpot',
    )
    await expect(wilf.page.locator('#brief-headline')).toHaveText('Everybody on the spot!')
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
