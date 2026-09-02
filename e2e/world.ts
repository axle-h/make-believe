import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test'

/*
 * Driving a blob is a feedback loop — look at where it is, move the thumb, look
 * again — and a room is herded one blob at a time, because they are solid and
 * shove each other. Every await in a loop here is deliberately in a queue.
 */
/* oxlint-disable no-await-in-loop */

/**
 * Helpers for driving one TV and its phones. The assertions read the host's
 * `window.__game` seam rather than pixels: Phaser cannot be screenshot-diffed
 * sensibly, and the model is the thing that decides what is true anyway.
 */

/** The blob's side length in world units, mirroring the model's own constant. */
export const BLOB_SIZE = 72

export interface PlayerSnapshot {
  playerId: string
  name: string
  slot: number
  colour: string
  x: number
  y: number
  dx: number
  dy: number
  away: boolean
  text: string | null
  skinKey: string | null
}

/** A patch of floor the objective has put down. */
export interface ZoneSnapshot {
  id: string
  shape: 'circle' | 'rect'
  x: number
  y: number
  radius?: number
  width?: number
  height?: number
  colour: string
}

export interface ObjectiveSnapshot {
  id: string
  kind: string
  headline: string
  remainingMs: number
  totalMs: number
  outcome: 'running' | 'done' | 'expired'
  note: string | null
  zones: ZoneSnapshot[]
}

export interface DirectorSnapshot {
  level: number
  score: number
  streak: number
  objective: ObjectiveSnapshot | null
}

export interface GameSnapshot {
  world: { width: number; height: number }
  players: PlayerSnapshot[]
  objectives: DirectorSnapshot
}

declare global {
  interface Window {
    __game?: {
      snapshot: () => GameSnapshot
      /** The texture each blob is actually wearing, keyed by playerId. */
      worn: () => Record<string, string>
      /** The world the relay gave this TV. Nothing on screen ever shows it. */
      session: () => string
    }
  }
}

export interface Host {
  page: Page
  /** The session the relay minted when this TV attached. */
  session: string
}

export interface Player {
  page: Page
  playerId: string
  name: string
  /**
   * Every socket this phone has opened, newest last. They are proxied straight
   * through to the real server; the test only holds them so that it can pull
   * the live one out, which is the one thing a browser will not do to order.
   */
  sockets: WebSocketRoute[]
}

/**
 * One evening's worth of browser contexts, closed together when the test ends.
 * Leaving one open is not a tidiness matter: a TV page that is still loaded
 * reconnects, takes the single world back from the next test, and both tests
 * lose it.
 */
export interface Party {
  openHost(): Promise<Host>
  /**
   * A phone joins. There is no code to carry across from the TV: the page it
   * is served is the only world there is, and which session of it this is gets
   * settled on the socket.
   */
  joinAs(name: string): Promise<Player>
  /** A phone opened at an arbitrary address, for the cases that never join. */
  openPhone(path: string): Promise<Page>
}

export const test = base.extend<{ party: Party }>({
  party: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    const open = async () => {
      const context = await browser.newContext()
      contexts.push(context)
      return context.newPage()
    }
    await use({
      openHost: () => openHost(open),
      joinAs: (name) => joinAs(open, name),
      openPhone: async (path) => {
        const page = await open()
        await page.goto(path)
        return page
      },
    })
    await Promise.all(contexts.map((context) => context.close()))
  },
})

type OpenPage = () => Promise<Page>

async function openHost(open: OpenPage): Promise<Host> {
  const page = await open()
  await page.goto('/host/')
  await expect(page.locator('#qr svg')).toBeVisible()
  // The session is nowhere on the TV — nothing shows it and nothing needs to —
  // so the test reads it from the same seam it reads the world from.
  await expect.poll(() => hostSession(page)).toMatch(/^[A-Z2-9]{4}$/)
  return { page, session: await hostSession(page) }
}

/** The world this TV is running, as the relay named it on connect. */
export function hostSession(page: Page): Promise<string> {
  return page.evaluate(() => {
    const game = window.__game
    if (!game) throw new Error('the host page has no test seam')
    return game.session()
  })
}

/**
 * Who this phone is right now. It is read rather than remembered because a
 * phone that meets a new world throws its identity away and mints another.
 */
export function playerIdNow(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('make-believe.playerId'))
}

async function joinAs(open: OpenPage, name: string): Promise<Player> {
  const page = await open()
  // Watch the phone's sockets without standing in their way: everything is
  // forwarded to the real relay, so the phone cannot tell the difference.
  const sockets: WebSocketRoute[] = []
  await page.routeWebSocket(/\/ws\?/, (ws) => {
    ws.connectToServer()
    sockets.push(ws)
  })
  // Nothing but the address. A phone that has scanned the QR code once, or
  // installed the page, opens exactly this.
  await page.goto('/')
  await page.fill('#name-input', name)
  await page.click('#join-button')
  await expect(page.locator('#screen-play')).toBeVisible()
  const playerId = await playerIdNow(page)
  expect(playerId).toBeTruthy()
  return { page, playerId: playerId as string, name, sockets }
}

/**
 * Yank the phone's connection away, as walking out of wifi range does, and
 * wait for the client to open the next one. Nothing on the page is touched:
 * the phone does not know it happened and nobody has pressed anything.
 */
export async function dropSocket(player: Player): Promise<void> {
  const live = player.sockets.at(-1)
  if (!live) throw new Error('the phone has not connected to anything')
  const before = player.sockets.length
  await live.close()
  await expect.poll(() => player.sockets.length, { timeout: 20_000 }).toBeGreaterThan(before)
}

export function snapshot(host: Host): Promise<GameSnapshot> {
  return host.page.evaluate(() => {
    const game = window.__game
    if (!game) throw new Error('the host page has no test seam')
    return game.snapshot()
  })
}

export function worn(host: Host): Promise<Record<string, string>> {
  return host.page.evaluate(() => window.__game?.worn() ?? {})
}

export async function playerNamed(host: Host, name: string): Promise<PlayerSnapshot> {
  const state = await snapshot(host)
  const player = state.players.find((one) => one.name === name)
  if (!player) throw new Error(`no blob called ${name}; saw ${state.players.length}`)
  return player
}

/** Push the joystick and hold it there, so the TV has frames to move on. */
export async function pushJoystick(
  player: Player,
  direction: { dx: number; dy: number },
  holdMs = 600,
): Promise<void> {
  const pad = player.page.locator('#pad')
  const box = await pad.boundingBox()
  if (!box) throw new Error('the joystick has no box')
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const reach = box.width / 2 - 4

  await player.page.mouse.move(centre.x, centre.y)
  await player.page.mouse.down()
  await player.page.mouse.move(centre.x + direction.dx * reach, centre.y + direction.dy * reach, {
    steps: 8,
  })
  await player.page.waitForTimeout(holdMs)
  await player.page.mouse.up()
}

/** What the world is asking for right now, or `null` between tasks. */
export async function objectiveNow(host: Host): Promise<ObjectiveSnapshot | null> {
  return (await snapshot(host)).objectives.objective
}

/**
 * Drive a blob to a spot on the floor with its joystick, the way a child does
 * — thumb down, steering, thumb up on arrival. Nothing is teleported: the
 * whole point is that the objective is solved through the controller.
 *
 * Returns whether it got there. Blobs are solid and shove each other, so a
 * blob can be wedged behind two others for a while; that is the game working,
 * not the test failing, and the caller is the one that decides what to do
 * about it.
 */
export async function driveTo(
  host: Host,
  player: Player,
  target: { x: number; y: number },
  within = 20,
): Promise<boolean> {
  const box = await player.page.locator('#pad').boundingBox()
  if (!box) throw new Error('the joystick has no box')
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const reach = box.width / 2 - 4

  await player.page.mouse.move(centre.x, centre.y)
  await player.page.mouse.down()
  try {
    let last: { x: number; y: number } | null = null
    let stuck = 0
    for (let step = 0; step < 90; step++) {
      const blob = await playerNamed(host, player.name)
      const gap = { x: target.x - blob.x, y: target.y - blob.y }
      const distance = Math.hypot(gap.x, gap.y)
      if (distance <= within) return true

      // Blobs are solid, so a straight line can end up wedged behind one.
      // Going sideways for a moment is what a child does about that, and it
      // tries the other way round if the first one does not free them.
      stuck = last && Math.hypot(blob.x - last.x, blob.y - last.y) < 4 ? stuck + 1 : 0
      last = { x: blob.x, y: blob.y }
      const sideways = stuck > 2 && stuck % 8 < 4
      const way = Math.floor(stuck / 8) % 2 === 0 ? 1 : -1
      const heading = sideways
        ? { x: (-gap.y / distance) * way, y: (gap.x / distance) * way }
        : { x: gap.x / distance, y: gap.y / distance }

      // Ease off near the target so the blob does not sail past it — but never
      // below the pad's dead zone, where the phone reads the thumb as centred
      // and the blob stops dead short of where it was going.
      const push = sideways ? 1 : Math.max(0.45, Math.min(1, distance / 150))
      await player.page.mouse.move(
        centre.x + heading.x * reach * push,
        centre.y + heading.y * reach * push,
      )
      await player.page.waitForTimeout(70)
    }
    return false
  } finally {
    // The thumb comes off whatever happened, so the blob is not left running.
    await player.page.mouse.up()
  }
}

/**
 * Solve "everybody on the spot" the way the room does: read the spot off the
 * TV, drive every blob onto it, and stand still while the TV counts the hold.
 *
 * It reads the objective afresh each time round, because one that runs out of
 * time is replaced by another — herding onto a spot that is no longer there is
 * the one way this could wait forever.
 */
export async function solveTheSpot(host: Host, crowd: Player[], attempts = 8): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const spot = (await objectiveNow(host))?.zones[0]
    if (spot) {
      for (const [player, target] of await placesOn(host, spot, crowd)) {
        const blob = await playerNamed(host, player.name)
        if (Math.hypot(blob.x - target.x, blob.y - target.y) > 16) {
          await driveTo(host, player, target, 16)
        }
      }
    }
    // Standing still is the rest of it; the TV counts the hold.
    await host.page.waitForTimeout(2_000)
    if ((await snapshot(host)).objectives.score > 0) return
  }
  throw new Error('the room never managed to stand on the spot together')
}

/**
 * Somewhere on the spot for each blob to stand: spread evenly round the
 * middle, far enough apart that arriving does not shove whoever got there
 * first back off it, and each blob given the nearest one going — blobs are
 * solid, and two of them swapping sides get wedged against each other.
 */
async function placesOn(
  host: Host,
  spot: ZoneSnapshot,
  crowd: Player[],
): Promise<[Player, { x: number; y: number }][]> {
  const radius = spot.radius ?? 60
  const apart = (BLOB_SIZE + 18) / (2 * Math.sin(Math.PI / crowd.length))
  const spread = Math.max(0, Math.min(radius - 20, apart))
  const places = crowd.map((_, index) => {
    const angle = (index / crowd.length) * Math.PI * 2
    return { x: spot.x + Math.cos(angle) * spread, y: spot.y + Math.sin(angle) * spread }
  })

  const taken = new Set<number>()
  const given: [Player, { x: number; y: number }][] = []
  for (const player of crowd) {
    const blob = await playerNamed(host, player.name)
    let nearest = -1
    let shortest = Number.POSITIVE_INFINITY
    for (const [index, place] of places.entries()) {
      if (taken.has(index)) continue
      const distance = Math.hypot(blob.x - place.x, blob.y - place.y)
      if (distance >= shortest) continue
      shortest = distance
      nearest = index
    }
    const place = places[nearest]
    if (!place) throw new Error('ran out of places on the spot')
    taken.add(nearest)
    given.push([player, place])
  }
  return given
}

/**
 * Open one of the tools over the joystick. They are always there — the TV has
 * no say in what a phone is doing.
 */
export async function openTool(player: Player, tool: 'say' | 'draw' | 'finish'): Promise<void> {
  await player.page.click(`#tool-${tool}`)
  await expect(player.page.locator(`#sheet-${tool}`)).toBeVisible()
}

/**
 * Finish with a blob, as a child who has had enough does: the tool, and then
 * the button that says so. The phone is back on the join screen afterwards,
 * holding nothing it held before.
 */
export async function finishPlaying(player: Player): Promise<void> {
  await openTool(player, 'finish')
  await player.page.click('#finish-confirm')
  await expect(player.page.locator('#screen-join')).toBeVisible()
}

/**
 * The same phone comes back as somebody new. There is nothing to it beyond a
 * name — the phone minted a fresh identity the moment it finished, so this is
 * a different blob however familiar the child holding it is.
 */
export async function joinAgainAs(player: Player, name: string): Promise<Player> {
  await player.page.fill('#name-input', name)
  await player.page.click('#join-button')
  await expect(player.page.locator('#screen-play')).toBeVisible()
  const playerId = await playerIdNow(player.page)
  expect(playerId).toBeTruthy()
  return { ...player, playerId: playerId as string, name }
}
