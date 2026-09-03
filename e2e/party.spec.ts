import { expect } from '@playwright/test'
import {
  BLOB_SIZE,
  LEVEL_UP_AFTER,
  askFor,
  briefTint,
  driveTo,
  dropSocket,
  finishPlaying,
  herdOnto,
  hostSession,
  isOn,
  joinAgainAs,
  objectiveNow,
  openTool,
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

  test('a blob can be redrawn as often as it likes without stopping the game', async ({
    party,
  }) => {
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')

    // Drive first, so the drawing lands in the middle of a game rather than at
    // the start of one.
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 300)
    const before = await playerNamed(host, 'Wilf')

    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect.poll(async () => (await playerNamed(host, 'Wilf')).skinKey).toBe(
      `skin-${wilf.playerId}-1`,
    )

    // A second drawing replaces the first, at any time.
    await openTool(wilf, 'draw')
    await scribble(wilf.page)
    await wilf.page.click('#draw-done')
    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).skinKey, { timeout: 8_000 })
      .toBe(`skin-${wilf.playerId}-2`)
    await expect
      .poll(async () => (await worn(host))[wilf.playerId], { timeout: 8_000 })
      .toBe(`skin-${wilf.playerId}-2`)

    // The same blob throughout: still where it drove to, still its own colour.
    const after = await playerNamed(host, 'Wilf')
    expect(after.playerId).toBe(before.playerId)
    expect(after.colour).toBe(before.colour)
    expect(after.y).toBeCloseTo(before.y, 0)
    expect((await snapshot(host)).players).toHaveLength(1)

    // ...and the joystick still drives after all that.
    await pushJoystick(wilf, { dx: 0, dy: 1 }, 400)
    expect((await playerNamed(host, 'Wilf')).y).toBeGreaterThan(after.y + 20)
  })

  /**
   * Finishing is the one thing on a phone that undoes anything, and it undoes
   * the lot. The blob goes from the TV with its name and its picture, whoever
   * else is playing carries on untouched, and the phone lands back on the name
   * screen with nothing of the old blob left to inherit.
   */
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

    // Gone from the TV outright — not parked, waiting for the phone to return.
    await expect
      .poll(async () => (await snapshot(host)).players.map((player) => player.name))
      .toEqual(['Ida'])
    await expect.poll(async () => (await worn(host))[before.playerId]).toBeUndefined()
    // The phone kept nothing either: no name to go straight back in with.
    expect(await wilf.page.inputValue('#name-input')).toBe('')
    expect(await playerIdNow(wilf.page)).not.toBe(wilf.playerId)

    // Whoever is still playing never noticed.
    expect(await playerNamed(host, 'Ida')).toMatchObject({
      playerId: ida.playerId,
      colour: idaBefore.colour,
    })

    // Somebody new on the same phone: a new blob, a new colour, no picture.
    const ted = await joinAgainAs(wilf, 'Ted')
    await expect.poll(async () => (await snapshot(host)).players.length).toBe(2)
    const fresh = await playerNamed(host, 'Ted')
    expect(fresh.playerId).not.toBe(before.playerId)
    expect(fresh.colour).not.toBe(before.colour)
    expect(fresh.colour).not.toBe(idaBefore.colour)
    expect(fresh.skinKey).toBeNull()

    // ...and it drives like any other blob.
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

  /**
   * Walking out of wifi is not finishing. The blob waits where it was, the
   * phone comes back on its own with nobody touching it, and what it walks
   * back into is the blob it left — same identity, same name, same colour.
   */
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

    // ...and it is the same blob, in the same place, still driveable.
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
      .toEqual(['Wilf'])
    const reborn = await playerIdNow(wilf.page)
    expect(reborn).not.toBe(wilf.playerId)
    await expect
      .poll(async () => (await playerNamed(host, 'Wilf')).skinKey, { timeout: 20_000 })
      .toBe(`skin-${reborn}-1`)
    await expect
      .poll(async () => (await worn(host))[reborn as string], { timeout: 10_000 })
      .toBe(`skin-${reborn}-1`)

    // ...and only once: the TV says it has the drawing, so nobody sends it again.
    await wilf.page.waitForTimeout(3_000)
    expect((await playerNamed(host, 'Wilf')).skinKey).toBe(`skin-${reborn}-1`)
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
    for (const tool of ['say', 'draw', 'menu']) {
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
   * The room gets good at the one thing it knows, the world notices, and
   * something else turns up — a chase rather than a huddle, with a potato on
   * somebody and no spot on the floor at all. Nobody chose it, nobody pressed
   * anything, and every tool on every phone works right through it.
   *
   * This is the slow one: the ladder is only real if it is climbed, so the
   * room genuinely solves the simple task three times over before the second
   * one is unlocked.
   */
  test('the room levels up, and the world starts asking for something else', async ({ party }) => {
    test.setTimeout(300_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')
    // Three of them, because the potato is a chase: two blobs can only hand it
    // back and forth, so the task will not run for fewer.
    const ted = await party.joinAs('Ted')
    const crowd = [wilf, ida, ted]

    // Everything it is asked for at first is the one thing it can already do.
    // Each one has to be finished before the next appears, so the queue here
    // is the game's, not the test's.
    /* oxlint-disable no-await-in-loop */
    for (let solved = 0; solved < LEVEL_UP_AFTER; solved++) {
      expect((await runningObjective(host)).kind).toBe('onTheSpot')
      await solveTheSpot(host, crowd)
    }
    /* oxlint-enable no-await-in-loop */
    expect((await snapshot(host)).objectives.level).toBe(2)

    // The room is told so, in the one line all evening that is about them
    // rather than about the game — and every phone gets it too.
    await Promise.all(
      crowd.map(async (phone) => {
        await expect(phone.page.locator('#brief-headline')).toHaveText('Level 2!')
        await expect(phone.page.locator('#brief')).toHaveAttribute('data-tone', 'level')
      }),
    )

    // Then a breather with the next one visibly coming, so that nobody has to
    // wonder whether the game has stopped.
    await expect
      .poll(async () => wilf.page.locator('#brief-detail').textContent(), { timeout: 20_000 })
      .toMatch(/^Next game in [1-5]s$/)
    // Every tool still works right through it: a breather is not a round.
    await expect(wilf.page.locator('#pad')).toBeVisible()
    await expect(wilf.page.locator('#tool-draw')).toBeEnabled()

    // ...and now there is something else, with nobody having chosen it: the
    // one thing level 2 just unlocked, which is the point of a level.
    const potato = await runningObjective(host)
    expect(potato.kind).toBe('hotPotato')
    // No spot to stand on: this one is entirely about who is touching whom.
    expect(potato.zones).toEqual([])
    // Something to run round, though. A chase across an empty floor is whoever
    // is quickest; a chase round a corner is a game.
    expect(potato.obstacles.length).toBeGreaterThan(0)

    // Somebody is holding it, and every phone is told who.
    const holder = whoIsMarked(potato, crowd)
    const chased = crowd.find((one) => one !== holder)
    if (!chased) throw new Error('expected somebody to chase')
    await Promise.all(
      crowd.map(async (phone) => {
        await expect(phone.page.locator('#brief-headline')).toHaveText('Hot potato!')
        await expect(phone.page.locator('#brief-detail')).toHaveText(`${holder.name} has it!`)
      }),
    )
    // The strip goes the colour of whoever has it, for a child who cannot read
    // the name off it.
    expect(await briefTint(chased.page)).toBe((await playerNamed(host, holder.name)).colour)

    // Being chased takes nothing away from anybody.
    await expect(chased.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'menu']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(chased.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    // Driving into somebody is the whole of passing it on. The watch starts
    // before the drive: they are still touching afterwards, so it can come
    // straight back once the breather is over.
    const passed = expect
      .poll(async () => (await objectiveNow(host))?.marks[0]?.playerId, { timeout: 60_000 })
      .toBe(chased.playerId)
    const target = await playerNamed(host, chased.name)
    await driveTo(host, holder, { x: target.x, y: target.y }, BLOB_SIZE + 2)
    await passed
    await expect(holder.page.locator('#brief-detail')).toHaveText(`${chased.name} has it!`)

    // The buzzer is how this one *finishes*, so the score goes up like any
    // other and somebody is named as having been caught with it. Start
    // watching first: the cheer is only up for a moment.
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

    // ...and something else again behind it, without anybody touching anything.
    // Which one is the director's business and not the test's: three blobs
    // standing still where the chase left them can finish a spot between two
    // polls, and the room may have climbed another rung by the time we look.
    // What has to be true is that a task is up and it is not this one again.
    expect((await runningObjective(host)).kind).not.toBe('hotPotato')

    // The joystick drives exactly as it did before any of that.
    const settled = await playerNamed(host, chased.name)
    const away = settled.y < (await snapshot(host)).world.height / 2 ? 1 : -1
    await pushJoystick(chased, { dx: 0, dy: away }, 400)
    const moved = (await playerNamed(host, chased.name)).y
    expect(away > 0 ? moved > settled.y + 20 : moved < settled.y - 20).toBe(true)
  })

  /**
   * Sumo, which is the one task built out of shoving. The island shrinks the
   * whole time, driving into somebody sends them skidding off it, and — the
   * part that matters — being off it is not a state anybody has been put into.
   * They drive straight back on.
   *
   * It unlocks at level 5, which is twelve solved tasks away, so `askFor` is
   * what gets the room there. Everything after that is the game: the director
   * generates it, the children solve it through their joysticks, and the TV
   * decides what happened.
   */
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

    // One circle and nothing else, and both phones told the same thing.
    expect(sumo.zones).toHaveLength(1)
    expect(sumo.carryables).toEqual([])
    for (const phone of [wilf, ida]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(phone.page.locator('#brief-headline')).toHaveText('Stay on the island!')
    }
    // The strip is the colour of the island, which is the thing to look at.
    expect(await briefTint(wilf.page)).toBe(island.colour)

    // Being shoved about takes nothing away from anybody.
    await expect(ida.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'menu']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(ida.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    // Both of them drive on, and the TV says so on both phones.
    await herdOnto(host, [wilf, ida], island)
    await expect(wilf.page.locator('#brief-detail')).toContainText('2 of 2 still on')

    // Wilf drives through Ida and out the far side, taking her with him.
    const shoved = expect
      .poll(
        async () => isOn(await zoneNow(host, island.id), await playerNamed(host, 'Ida')),
        { timeout: 20_000 },
      )
      .toBe(false)
    await driveTo(host, wilf, { x: island.x + island.radius! + BLOB_SIZE, y: island.y }, 30)
    await shoved

    // ...and Ida drives back on, because nothing has taken anything from her.
    const middle = await zoneNow(host, island.id)
    await driveTo(host, ida, { x: middle.x, y: middle.y }, 20)
    expect(isOn(await zoneNow(host, island.id), await playerNamed(host, 'Ida'))).toBe(true)

    // The island has been getting smaller the whole time they were doing it.
    expect((await zoneNow(host, island.id)).radius!).toBeLessThan(island.radius!)
  })

  /**
   * The buzzer is how sumo *finishes*, the way hot potato does: the score goes
   * up, the TV says who held on, and the next task appears behind it. Nobody
   * has lost anything and nobody is sitting out.
   */
  test('sumo ends at the buzzer with whoever is left standing', async ({ party }) => {
    test.setTimeout(180_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')

    const sumo = await askFor(host, 'sumo', 5)
    const island = sumo.zones[0]
    if (!island) throw new Error('expected an island on the floor')
    await herdOnto(host, [wilf, ida], island)

    // Start watching the phone first: the cheer is only up for a moment.
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

    // ...and something else behind it, without anybody touching anything.
    expect((await runningObjective(host)).outcome).toBe('running')
  })

  /**
   * Keep the crown: hot potato inside out. Everybody runs *at* whoever has it
   * rather than away, and it is the first task in this suite that tells one
   * phone something different from the rest — the blob being chased gets its
   * own countdown, and nobody else is told it.
   *
   * It is the last thing the ladder unlocks, twenty-one solved tasks up, so
   * `askFor` is what gets the room there.
   */
  test('the crown is taken by driving into whoever has it, and counts them down privately', async ({
    party,
  }) => {
    test.setTimeout(180_000)
    const host = await party.openHost()
    const wilf = await party.joinAs('Wilf')
    const ida = await party.joinAs('Ida')
    const crowd = [wilf, ida]

    const crown = await askFor(host, 'keepTheCrown', 8)
    // Nothing on the floor: the crown is worn, not carried about.
    expect(crown.zones).toEqual([])
    expect(crown.carryables).toEqual([])

    const wearer = whoIsMarked(crown, crowd)
    const chaser = crowd.find((one) => one !== wearer)
    if (!chaser) throw new Error('expected somebody to give chase')

    // Everybody is told who to go for, and how to go for them.
    await expect(chaser.page.locator('#brief-headline')).toHaveText('Keep the crown!')
    await expect(chaser.page.locator('#brief-detail')).toHaveText(
      `${wearer.name} has it! Drive into them to take it.`,
    )
    // The strip goes the colour of whoever is wearing it, for a child who
    // cannot read the name off it.
    expect(await briefTint(chaser.page)).toBe((await playerNamed(host, wearer.name)).colour)

    // ...and the one phone being chased is told something nobody else is.
    await expect(wearer.page.locator('#brief-detail')).toContainText('Run!')

    // Being chased takes nothing away from anybody.
    await expect(wearer.page.locator('#pad')).toBeVisible()
    for (const tool of ['say', 'draw', 'menu']) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(wearer.page.locator(`#tool-${tool}`)).toBeEnabled()
    }

    // Driving into them is the whole of taking it. The watch starts before the
    // drive: they are still touching afterwards, so it can go straight back
    // once the new wearer's moment of safety is up.
    const taken = expect
      .poll(async () => (await objectiveNow(host))?.marks[0]?.playerId, { timeout: 60_000 })
      .toBe(chaser.playerId)
    const target = await playerNamed(host, wearer.name)
    await driveTo(host, chaser, { x: target.x, y: target.y }, BLOB_SIZE + 2)
    await taken

    // The private countdown went with it: the phone that had it is now being
    // told who to chase, like everybody else.
    await expect(wearer.page.locator('#brief-detail')).toHaveText(
      `${chaser.name} has it! Drive into them to take it.`,
    )
  })

  /**
   * However it ends — kept long enough, or the buzzer beating them to it — it
   * ends cheerfully, somebody is named, and the score goes up. Nobody is
   * eliminated and nobody sits out.
   */
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

    // Nobody has to do anything for this one to finish: whoever it started on
    // simply keeps it, which is the task being solved rather than abandoned.
    await expect
      .poll(async () => (await objectiveNow(host))?.outcome, { timeout: 90_000 })
      .not.toBe('running')
    await cheered

    const ended = await objectiveNow(host)
    expect(ended?.outcome).toBe('done')
    expect(ended?.note).toMatch(/Wilf|Ida|Ted/)
    expect((await snapshot(host)).objectives.score).toBeGreaterThan(before)

    // The joystick drives exactly as it did before any of that.
    const settled = await playerNamed(host, 'Ida')
    const away = settled.y < (await snapshot(host)).world.height / 2 ? 1 : -1
    await pushJoystick(ida, { dx: 0, dy: away }, 400)
    const moved = (await playerNamed(host, 'Ida')).y
    expect(away > 0 ? moved > settled.y + 20 : moved < settled.y - 20).toBe(true)
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
