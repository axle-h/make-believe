import { expect } from '@playwright/test'
import {
  BLOB_SIZE,
  LEVEL_UP_AFTER,
  askFor,
  briefTint,
  chaseSomebody,
  driveTo,
  dropSocket,
  everyKind,
  expectDrives,
  finishPlaying,
  freeColours,
  herdOnto,
  hostSession,
  isOn,
  joinAgainAs,
  nearestBlob,
  objectiveNow,
  openTool,
  pickAndJoin,
  playerIdNow,
  playerNamed,
  pushJoystick,
  runningObjective,
  snapshot,
  solveTheSpot,
  test,
  whoIsMarked,
  worn,
  zoneNow,
} from './world.js'

/** One continuous session with no rounds, asserted through the host's model. */
test.describe('a party', () => {
  test('two phones join, drive, talk and draw', async ({ party }) => {
    const host = await party.openHost()
    await expect(host.page.locator('#qr svg')).toBeVisible()

    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name))
      .toEqual(['Wilf', 'Ida'])

    const before = {
      wilf: await playerNamed(host, 'Wilf'),
      ida: await playerNamed(host, 'Ida'),
    }
    expect(before.wilf.colour).not.toBe(before.ida.colour)

    // Downwards into empty floor: driving across would shove Ida, a collision rather than a stray input.
    await pushJoystick(wilf, { dx: 0, dy: 1 })

    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).y > before.wilf.y + 50)
      .toBe(true)
    const idaNow = await playerNamed(host, 'Ida')
    expect({ x: idaNow.x, y: idaNow.y }).toEqual({ x: before.ida.x, y: before.ida.y })

    const stopped = (await playerNamed(host, 'Wilf')).y
    await host.page.waitForTimeout(300)
    expect((await playerNamed(host, 'Wilf')).y).toBeCloseTo(stopped, 0)

    await openTool(ida, 'say')
    await ida.page.fill('#text-input', 'hello mum')
    await ida.page.click('#text-send')

    await expect.poll(async () => (await playerNamed(host, 'Ida')).text, { timeout: 4_000 }).toBe(
      'hello mum',
    )
    expect((await playerNamed(host, 'Wilf')).text).toBeNull()
    await expect(ida.page.locator('#text-input')).toHaveValue('')

    // Ida can drive with the bubble still up.
    await ida.page.click('#say-close')
    await expect(ida.page.locator('#pad')).toBeVisible()
    expect((await playerNamed(host, 'Ida')).text).toBe('hello mum')

    await expect.poll(async () => (await playerNamed(host, 'Ida')).text, { timeout: 12_000 }).toBeNull()

    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect(wilf.page.locator('#sheet-draw')).toBeHidden()

    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).skinKey, { timeout: 8_000 })
      .not.toBeNull()
    const skinKey = (await playerNamed(host, 'Wilf')).skinKey
    expect(skinKey).toMatch(/^skin-.+-1$/)
    // The drawing reached the sprite, not just the model.
    await expect.poll(async () => (await worn(host))[wilf.playerId], { timeout: 8_000 }).toBe(skinKey)
    expect((await playerNamed(host, 'Ida')).skinKey).toBeNull()
  })

  test('a blob can be redrawn as often as it likes without stopping the game', async ({
    party,
  }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

    // Drive first, so the drawing lands mid-game.
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 300)
    const before = await playerNamed(host, 'Wilf')

    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect.poll(async () => (await playerNamed(host, 'Wilf')).skinKey).toBe(
      `skin-${wilf.playerId}-1`,
    )

    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).skinKey, { timeout: 8_000 })
      .toBe(`skin-${wilf.playerId}-2`)
    await expect
      .poll(async () => (await worn(host))[wilf.playerId], { timeout: 8_000 })
      .toBe(`skin-${wilf.playerId}-2`)

    const after = await playerNamed(host, 'Wilf')
    expect(after.playerId).toBe(before.playerId)
    expect(after.colour).toBe(before.colour)
    expect(after.y).toBeCloseTo(before.y, 0)
    expect((await snapshot(host)).players).toHaveLength(1)

    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeGreaterThan(after.y + 20)
  })

  /** Finishing undoes the lot: blob, name and picture go, the others carry on, the phone keeps nothing. */
  test('a blob that finishes is forgotten, and its phone starts again as somebody new', async ({
    party,
  }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect.poll(async () => (await playerNamed(host, 'Wilf')).skinKey).toBe(
      `skin-${wilf.playerId}-1`,
    )
    const before = await playerNamed(host, 'Wilf')
    const idaBefore = await playerNamed(host, 'Ida')

    await finishPlaying(wilf)

    // Gone outright, not parked waiting for the phone to return.
    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name))
      .toEqual(['Ida'])
    await expect.poll(async () => (await worn(host))[before.playerId]).toBeUndefined()
    expect(await wilf.page.inputValue('#name-input')).toBe('')
    expect(await playerIdNow(wilf.page)).not.toBe(wilf.playerId)

    expect(await playerNamed(host, 'Ida')).toMatchObject({
      playerId: ida.playerId,
      colour: idaBefore.colour,
    })

    // The colour just given up is back on the palette like any other.
    const ted = await joinAgainAs(wilf, 'Ted')
    await expect.poll(async () => (await snapshot(host)).players.length).toBe(2)
    const fresh = await playerNamed(host, 'Ted')
    expect(fresh.playerId).not.toBe(before.playerId)
    expect(fresh.colour).not.toBe(idaBefore.colour)
    expect(fresh.skinKey).toBeNull()

    await pushJoystick(ted, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Ted')).y).toBeGreaterThan(fresh.y + 20)
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

    const wilfNow = await playerNamed(host, 'Wilf')
    expect(Math.abs(after.x - wilfNow.x)).toBeGreaterThanOrEqual(BLOB_SIZE - 1)
  })

  /** The only check that Phaser can draw every task: the console is watched for anything thrown. */
  test('the TV draws every task without falling over', async ({ party }) => {
    test.setTimeout(180_000)
    const host = await party.openHost()
    const complaints: string[] = []
    host.page.on('pageerror', (error) => complaints.push(String(error)))
    host.page.on('console', (message) => {
      if (message.type() === 'error') complaints.push(message.text())
    })
    // Four blobs: enough for every task, two to a pad included.
    const crowd = []
    for (const name of ['Wilf', 'Ida', 'Ted', 'Bo']) {
      // oxlint-disable-next-line no-await-in-loop
      crowd.push(await party.joinAs(name))
    }

    for (const kind of await everyKind(host)) {
      // oxlint-disable-next-line no-await-in-loop
      const objective = await askFor(host, kind, 8)
      expect(objective.kind).toBe(kind)
      // Long enough for a bar to turn, a pad to drift and a tomato to cross.
      // oxlint-disable-next-line no-await-in-loop
      await host.page.waitForTimeout(1_200)
      // oxlint-disable-next-line no-await-in-loop
      expect((await objectiveNow(host))?.kind).toBe(kind)
    }

    expect(complaints).toEqual([])
    await expect(crowd[0]?.page.locator('#pad') ?? host.page.locator('#world')).toBeVisible()
  })

  /** Daddy's phone gets the grown-up's sheet; no other phone has any trace of it, since it is a secret. */
  test('a grown-up can pick a task from the sofa, and nobody else can find it', async ({
    party,
  }) => {
    test.setTimeout(120_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const daddy = await party.joinAs('Daddy')

    // Every other phone's menu is the sound switch and Quit.
    await openTool(wilf, 'menu')
    await expect(wilf.page.locator('#sheet-menu .menu-items button')).toHaveCount(2)
    await expect(wilf.page.locator('#menu-quit')).toBeVisible()
    await expect(wilf.page.locator('#menu-sound')).toBeVisible()
    // Not hidden, not greyed — not there. A disabled item is an advertisement.
    await expect(wilf.page.locator('#sheet-options')).toHaveCount(0)
    await expect(wilf.page.locator('#menu-options')).toHaveCount(0)
    expect(await wilf.page.content()).not.toContain('Start from the beginning')
    await wilf.page.click('#menu-close')

    await openTool(daddy, 'menu')
    await expect(daddy.page.locator('#sheet-menu .menu-items button')).toHaveCount(3)
    await daddy.page.click('#menu-options')
    await expect(daddy.page.locator('#sheet-options')).toBeVisible()

    await daddy.page.click('#sheet-options button[data-task="sumo"]')
    await expect.poll(async () => (await runningObjective(host)).kind).toBe('sumo')
    // The phone went back to its joystick rather than into a mode.
    await expect(daddy.page.locator('#pad')).toBeVisible()

    // Restarting asks first; earn a score for it to put back.
    await openTool(daddy, 'menu')
    await daddy.page.click('#menu-options')
    await daddy.page.click('#sheet-options button[data-task="onTheSpot"]')
    await expect.poll(async () => (await runningObjective(host)).kind).toBe('onTheSpot')
    await solveTheSpot(host, [wilf, daddy])
    expect((await snapshot(host)).objectives.score).toBeGreaterThan(0)

    await openTool(daddy, 'menu')
    await daddy.page.click('#menu-options')
    await daddy.page.click('#options-restart')
    await expect(daddy.page.locator('#options-restart-confirm')).toBeVisible()
    await daddy.page.click('#options-restart-confirm')

    await expect.poll(async () => (await snapshot(host)).objectives.score).toBe(0)
    expect((await snapshot(host)).objectives.level).toBe(1)

    await expectDrives(host, daddy, 'Daddy')
  })

  /** A new phone opens the bare address and is asked for a name and a colour, nothing else. */
  test('a phone opened at the bare URL picks a name and a colour, and nothing else', async ({
    party,
  }) => {
    await party.openHost()
    const phone = await party.openPhone('/')

    await pickAndJoin(phone, 'Wilf')

    // Next time it is already this world's blob, so opening the page is the whole of it.
    await phone.goto('/')
    await expect(phone.locator('#screen-play')).toBeVisible()
  })

  /** One blob per colour: a taken swatch is greyed with its owner's name, and nothing is queued. */
  test('a colour somebody has is greyed on everybody else, with their name on it', async ({
    party,
  }) => {
    const host = await party.openHost()
    const phone = await party.openPhone('/')
    await expect(phone.locator('#screen-join')).toBeVisible()
    const going = await freeColours(phone)
    const wanted = going[0] as string

    const wilf = await party.joinAs('Wilf', wanted)

    // Greyed live, with nobody refreshing anything.
    const taken = phone.locator(`#join-colours .swatch[data-colour="${wanted}"]`)
    await expect(taken).toBeDisabled()
    await expect(taken).toHaveText('Wilf')
    await expect.poll(async () => (await freeColours(phone)).includes(wanted)).toBe(false)

    await pickAndJoin(phone, 'Ida')
    const both = (await snapshot(host)).players
    expect(both).toHaveLength(2)
    expect(new Set(both.map((player) => player.colour)).size).toBe(2)
    expect((await playerNamed(host, 'Wilf')).colour).toBe(wanted)
    expect(wilf.name).toBe('Wilf')
  })

  /** One blob per name, on the same terms as one per colour. */
  test('a name somebody has is refused, and the phone is told so', async ({ party }) => {
    const host = await party.openHost()
    await party.joinAs('Ivy')
    const phone = await party.openPhone('/')
    await expect(phone.locator('#screen-join')).toBeVisible()

    // Said while typing, from the palette the phone already has.
    await phone.fill('#name-input', 'ivy')
    await expect(phone.locator('#join-error')).toHaveText('Somebody is already called that.')

    // Refused again by the world, which alone decides; the phone lands back on the join screen.
    await phone.locator('#join-colours .swatch:not(:disabled)').first().click()
    await phone.click('#join-button')
    await expect(phone.locator('#screen-join')).toBeVisible()
    await expect(phone.locator('#join-error')).toHaveText('Somebody is already called that.')
    expect((await snapshot(host)).players).toHaveLength(1)

    await pickAndJoin(phone, 'Ida')
    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name).toSorted())
      .toEqual(['Ida', 'Ivy'])
  })

  test('a phone that reloads keeps its blob', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    const before = await playerNamed(host, 'Wilf')

    await wilf.page.reload()
    await expect(wilf.page.locator('#screen-play')).toBeVisible()

    const after = await playerNamed(host, 'Wilf')
    expect(after.playerId).toBe(before.playerId)
    expect(after.slot).toBe(before.slot)
    expect(after.colour).toBe(before.colour)
    expect(after.y).toBeCloseTo(before.y, 0)
    expect((await snapshot(host)).players).toHaveLength(1)
  })

  /** A reloaded TV is a new world: each phone drops its identity and returns under its name, untouched. */
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

    const back = await playerNamed(host, 'Wilf')
    expect(back.playerId).not.toBe(wilf.playerId)
    expect(await playerIdNow(wilf.page)).toBe(back.playerId)
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeGreaterThan(back.y + 20)
  })

  /** A phone loaded with no TV must get itself in when one arrives: nobody is there to reload it. */
  test('a phone opened while there is no TV gets in when one arrives', async ({ party }) => {
    const first = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    await expect.poll(async () => (await snapshot(first)).players.length).toBe(1)

    // Closed, not reloaded: this needs a while with no world at all.
    await first.page.close()
    await expect(wilf.page.locator('#screen-waiting')).toBeVisible()

    // Reopened while the TV is off, as Android does to an app whose memory it took back.
    await wilf.page.reload()
    await expect(wilf.page.locator('#screen-waiting')).toBeVisible()
    await expect(wilf.page.locator('#waiting-name')).toHaveText('Wilf')

    // Nobody touches the phone from here.
    const second = await party.openHost()
    await expect(wilf.page.locator('#screen-play')).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => (await snapshot(second)).players.map((player) => player.name), {
        timeout: 20_000,
      })
      .toEqual(['Wilf'])

    // Driving is the only proof that getting in worked.
    const back = await playerNamed(second, 'Wilf')
    expect(back.playerId).not.toBe(wilf.playerId)
    expect(await playerIdNow(wilf.page)).toBe(back.playerId)
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(second, 'Wilf')).y).toBeGreaterThan(back.y + 20)
  })

  /** Dropping off wifi is not finishing: the phone walks back into the same blob, untouched. */
  test('a phone that drops off walks back into the blob it left', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 300)
    const before = await playerNamed(host, 'Wilf')

    await dropSocket(wilf)
    await expect(wilf.page.locator('#screen-play')).toBeVisible()

    await expect.poll(async () => (await snapshot(host)).players[0]?.away, { timeout: 15_000 }).toBe(
      false,
    )
    await wilf.page.waitForTimeout(1_000)
    expect((await snapshot(host)).players.map((player) => player.name)).toEqual(['Wilf'])

    const settled = await playerNamed(host, 'Wilf')
    expect(settled.playerId).toBe(wilf.playerId)
    expect(settled.colour).toBe(before.colour)
    expect(settled.y).toBeCloseTo(before.y, 0)
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeGreaterThan(settled.y + 20)
  })

  test('a TV that forgets everything gets the drawings back from the phones', async ({ party }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect.poll(async () => (await playerNamed(host, 'Wilf')).skinKey).toBe(
      `skin-${wilf.playerId}-1`,
    )

    // The phone reloads too, so the picture can only come back from storage.
    await wilf.page.reload()
    await expect(wilf.page.locator('#screen-play')).toBeVisible()

    // The new world has never heard of this blob; the phone holds the only copy of its picture.
    await host.page.reload()
    await expect(host.page.locator('#qr svg')).toBeVisible()

    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name), {
        timeout: 20_000,
      })
      .toEqual(['Wilf'])
    const reborn = await playerIdNow(wilf.page)
    expect(reborn).not.toBe(wilf.playerId)
    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).skinKey, { timeout: 20_000 })
      .toBe(`skin-${reborn}-1`)
    await expect
      .poll(async () => (await worn(host))[reborn as string], { timeout: 10_000 })
      .toBe(`skin-${reborn}-1`)

    // Only once: the TV says it has the drawing, so nobody sends it again.
    await wilf.page.waitForTimeout(3_000)
    expect((await playerNamed(host, 'Wilf')).skinKey).toBe(`skin-${reborn}-1`)
  })
})

/** The world asks on its own, every phone is told, and nothing on a phone is taken away meanwhile. */
test.describe('an objective', () => {
  test('appears on its own, is told to every phone, and can be solved by driving', async ({
    party,
  }) => {
    test.setTimeout(120_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    // The second blob makes a task appear, with nobody pressing anything.
    await expect.poll(async () => (await objectiveNow(host))?.kind, { timeout: 15_000 }).toBe(
      'onTheSpot',
    )
    const objective = await objectiveNow(host)
    const spot = objective?.zones[0]
    if (!objective || !spot) throw new Error('expected a spot on the floor')

    await expect(wilf.page.locator('#brief-headline')).toHaveText(objective.headline)
    await expect(ida.page.locator('#brief-headline')).toHaveText(objective.headline)
    await expect(wilf.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'menu']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(wilf.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    // A phone arriving halfway through is told, unasked.
    const ted = await party.joinAs('Ted')
    await expect(ted.page.locator('#brief-headline')).toHaveText(objective.headline)

    await openTool(ted, 'say')
    await ted.page.fill('#text-input', 'where is it')
    await ted.page.click('#text-send')
    await ted.page.click('#say-close')
    await expect.poll(async () => (await playerNamed(host, 'Ted')).text).toBe('where is it')

    // Watch before solving: the cheer is only up for a moment.
    const cheered = expect(wilf.page.locator('#brief')).toHaveAttribute('data-tone', 'win', {
      timeout: 90_000,
    })

    await solveTheSpot(host, [wilf, ida, ted])
    expect((await snapshot(host)).objectives.score).toBeGreaterThan(0)
    await cheered

    await expect
      .poll(async () => (await objectiveNow(host))?.id, { timeout: 30_000 })
      .not.toBe(objective.id)
    await expect.poll(async () => (await objectiveNow(host))?.outcome, { timeout: 30_000 }).toBe(
      'running',
    )

    const settled = await playerNamed(host, 'Wilf')
    await pushJoystick(wilf, { dx: 0, dy: -1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeLessThan(settled.y - 20)
  })

  /**
   * Climbs the ladder for real: the spot is solved three times before level 2 brings hot potato.
   * Nothing may replace this climb with a shortcut.
   */
  test('the room levels up, and the world starts asking for something else', async ({ party }) => {
    test.setTimeout(300_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')
    // Three: the potato will not run for fewer.
    const ted = await party.joinAs('Ted')
    const crowd = [wilf, ida, ted]

    /* oxlint-disable no-await-in-loop */
    for (let solved = 0; solved < LEVEL_UP_AFTER; solved++) {
      expect((await runningObjective(host)).kind).toBe('onTheSpot')
      await solveTheSpot(host, crowd)
    }
    /* oxlint-enable no-await-in-loop */
    expect((await snapshot(host)).objectives.level).toBe(2)

    await Promise.all(
      crowd.map(async (phone) => {
        await expect(phone.page.locator('#brief-headline')).toHaveText('Level 2!')
        await expect(phone.page.locator('#brief')).toHaveAttribute('data-tone', 'level')
      }),
    )

    await expect
      .poll(async () => wilf.page.locator('#brief-detail').textContent(), { timeout: 20_000 })
      .toMatch(/^Next game in [1-5]s$/)
    // A breather is not a round: every tool still works.
    await expect(wilf.page.locator('#pad')).toBeVisible()
    await expect(wilf.page.locator('#tool-draw')).toBeEnabled()

    // The first thing level 2 unlocked, which is the point of a level.
    const potato = await runningObjective(host)
    expect(potato.kind).toBe('hotPotato')
    expect(potato.zones).toEqual([])
    expect(potato.obstacles.length).toBeGreaterThan(0)

    const holder = whoIsMarked(potato, crowd)
    const others = crowd.filter((one) => one !== holder)
    const chased = await nearestBlob(host, holder, others)
    await Promise.all(
      crowd.map(async (phone) => {
        await expect(phone.page.locator('#brief-headline')).toHaveText('Hot potato!')
        await expect(phone.page.locator('#brief-detail')).toHaveText(
          `${holder.name} has it — run away!`,
        )
      }),
    )
    // The strip is the holder's colour, for a child who cannot read the name.
    expect(await briefTint(chased.page)).toBe((await playerNamed(host, holder.name)).colour)

    await expect(chased.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'menu']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(chased.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    // Passed to anybody, since the holder may brush past the wrong blob. Watched before the drive,
    // because they are still touching afterwards and it can come straight back.
    const passed = expect
      .poll(
        async () => {
          const wearing = (await objectiveNow(host))?.marks[0]?.playerId
          return others.some((one) => one.playerId === wearing)
        },
        { timeout: 60_000 },
      )
      .toBe(true)
    await chaseSomebody(host, holder, others)
    await passed

    await expect
      .poll(() => holder.page.locator('#brief-detail').textContent(), { timeout: 15_000 })
      .not.toBe(`${holder.name} has it!`)

    // The buzzer finishes it: the score goes up and somebody is named.
    const cheered = expect(chased.page.locator('#brief')).toHaveAttribute('data-tone', 'win', {
      timeout: 90_000,
    })
    const before = (await snapshot(host)).objectives.score
    await expect
      .poll(async () => (await objectiveNow(host))?.outcome, { timeout: 90_000 })
      .not.toBe('running')
    await cheered

    const ended = await objectiveNow(host)
    expect(ended?.outcome).toBe('done')
    expect(ended?.note).toMatch(/Wilf|Ida|Ted/)
    expect((await snapshot(host)).objectives.score).toBeGreaterThan(before)

    // Which task is next is the director's business; it must only not be this one again.
    expect((await runningObjective(host)).kind).not.toBe('hotPotato')

    await expectDrives(host, chased, chased.name)
  })

  /** Sumo's island shrinks, and a blob shoved off it is not out: it drives straight back on. */
  test('sumo shrinks its island, and a blob shoved off drives straight back on', async ({
    party,
  }) => {
    test.setTimeout(180_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    const sumo = await askFor(host, 'sumo', 5)
    const island = sumo.zones[0]
    if (!island) throw new Error('expected an island on the floor')

    expect(sumo.zones).toHaveLength(1)
    expect(sumo.carryables).toEqual([])
    for (const phone of [wilf, ida]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(phone.page.locator('#brief-headline')).toHaveText('Stay on the island!')
    }
    // The strip is the island's colour.
    expect(await briefTint(wilf.page)).toBe(island.colour)

    await expect(ida.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'menu']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(ida.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    await herdOnto(host, [wilf, ida], island)
    await expect(wilf.page.locator('#brief-detail')).toContainText('2 of 2 still on')

    const shoved = expect
      .poll(
        async () => isOn(await zoneNow(host, island.id), await playerNamed(host, 'Ida')),
        { timeout: 20_000 },
      )
      .toBe(false)
    await driveTo(host, wilf, { x: island.x + island.radius! + BLOB_SIZE, y: island.y }, 30)
    await shoved

    // Nothing has been taken from Ida, so she drives back on.
    const middle = await zoneNow(host, island.id)
    await driveTo(host, ida, { x: middle.x, y: middle.y }, 20)
    expect(isOn(await zoneNow(host, island.id), await playerNamed(host, 'Ida'))).toBe(true)

    expect((await zoneNow(host, island.id)).radius!).toBeLessThan(island.radius!)
  })

  /** The buzzer finishes sumo: the score goes up, the TV names who held on, the next task appears. */
  test('sumo ends at the buzzer with whoever is left standing', async ({ party }) => {
    test.setTimeout(180_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    const sumo = await askFor(host, 'sumo', 5)
    const island = sumo.zones[0]
    if (!island) throw new Error('expected an island on the floor')
    await herdOnto(host, [wilf, ida], island)

    const cheered = expect(ida.page.locator('#brief')).toHaveAttribute('data-tone', 'win', {
      timeout: 90_000,
    })
    const before = (await snapshot(host)).objectives.score
    await expect
      .poll(async () => (await objectiveNow(host))?.outcome, { timeout: 90_000 })
      .not.toBe('running')
    await cheered

    const ended = await objectiveNow(host)
    expect(ended?.outcome).toBe('done')
    expect(ended?.note).toMatch(/held on|standing/)
    expect((await snapshot(host)).objectives.score).toBeGreaterThan(before)

    expect((await runningObjective(host)).outcome).toBe('running')
  })

  /** Keep the crown: everybody chases the wearer, and only the wearer's phone gets a countdown. */
  test('the crown is taken by driving into whoever has it, and counts them down privately', async ({
    party,
  }) => {
    test.setTimeout(180_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')
    const crowd = [wilf, ida]

    const crown = await askFor(host, 'keepTheCrown', 8)
    expect(crown.zones).toEqual([])
    expect(crown.carryables).toEqual([])

    const wearer = whoIsMarked(crown, crowd)
    const chaser = crowd.find((one) => one !== wearer)
    if (!chaser) throw new Error('expected somebody to give chase')

    await expect(chaser.page.locator('#brief-headline')).toHaveText(crown.headline)
    await expect(chaser.page.locator('#brief-detail')).toHaveText(
      `${wearer.name} has it! Drive into them to take it.`,
    )
    expect(await briefTint(chaser.page)).toBe((await playerNamed(host, wearer.name)).colour)

    await expect(wearer.page.locator('#brief-detail')).toContainText('Run!')

    // Being chased takes nothing away from anybody.
    await expect(wearer.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'menu']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(wearer.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    // Watched before the drive: they are still touching afterwards, so it can go straight back.
    const taken = expect
      .poll(async () => (await objectiveNow(host))?.marks[0]?.playerId, { timeout: 60_000 })
      .toBe(chaser.playerId)
    const target = await playerNamed(host, wearer.name)
    await driveTo(host, chaser, { x: target.x, y: target.y }, BLOB_SIZE + 2)
    await taken

    // The private countdown went with the crown.
    await expect(wearer.page.locator('#brief-detail')).toHaveText(
      `${chaser.name} has it! Drive into them to take it.`,
    )
  })

  /** However the crown ends, somebody is named and the score goes up. */
  test('the crown ends with somebody named, whoever managed to keep it', async ({ party }) => {
    test.setTimeout(180_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    await askFor(host, 'keepTheCrown', 8)
    const cheered = expect(wilf.page.locator('#brief')).toHaveAttribute('data-tone', 'win', {
      timeout: 90_000,
    })
    const before = (await snapshot(host)).objectives.score

    // Nobody need do anything: whoever it started on keeps it, which solves it.
    await expect
      .poll(async () => (await objectiveNow(host))?.outcome, { timeout: 90_000 })
      .not.toBe('running')
    await cheered

    const ended = await objectiveNow(host)
    expect(ended?.outcome).toBe('done')
    expect(ended?.note).toMatch(/Wilf|Ida|Ted/)
    expect((await snapshot(host)).objectives.score).toBeGreaterThan(before)

    await expectDrives(host, ida, 'Ida')
  })

  /** A room too small for a task asks for nothing, says why, and still drives. */
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
