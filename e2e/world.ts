import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test'

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

export interface GameSnapshot {
  world: { width: number; height: number }
  players: PlayerSnapshot[]
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

/**
 * Open one of the tools over the joystick. They are always there — the TV has
 * no say in what a phone is doing.
 */
export async function openTool(player: Player, tool: 'say' | 'draw' | 'name'): Promise<void> {
  await player.page.click(`#tool-${tool}`)
  await expect(player.page.locator(`#sheet-${tool}`)).toBeVisible()
}
