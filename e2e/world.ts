import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'

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
  phase: 'lobby' | 'play' | 'draw' | 'text'
  players: PlayerSnapshot[]
}

declare global {
  interface Window {
    __game?: {
      snapshot: () => GameSnapshot
      /** The texture each blob is actually wearing, keyed by playerId. */
      worn: () => Record<string, string>
    }
  }
}

export interface Host {
  page: Page
  roomCode: string
}

export interface Player {
  page: Page
  playerId: string
  name: string
}

/**
 * One evening's worth of browser contexts, closed together when the test ends.
 * Leaving one open is not a tidiness matter: a TV page that is still loaded
 * reconnects, takes the single world back from the next test, and both tests
 * lose it.
 */
export interface Party {
  openHost(): Promise<Host>
  joinAs(roomCode: string, name: string): Promise<Player>
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
      joinAs: (roomCode, name) => joinAs(open, roomCode, name),
    })
    await Promise.all(contexts.map((context) => context.close()))
  },
})

type OpenPage = () => Promise<Page>

async function openHost(open: OpenPage): Promise<Host> {
  const page = await open()
  await page.goto('/host/')
  await expect(page.locator('#room-code')).not.toHaveText('····')
  const roomCode = (await page.locator('#room-code').textContent()) ?? ''
  expect(roomCode).toMatch(/^[A-Z2-9]{4}$/)
  return { page, roomCode }
}

async function joinAs(open: OpenPage, roomCode: string, name: string): Promise<Player> {
  const page = await open()
  // The link a QR scan would open.
  await page.goto(`/?room=${roomCode}`)
  await page.fill('#name-input', name)
  await page.click('#join-button')
  await expect(page.locator('#screen-play')).toBeVisible()
  const playerId = await page.evaluate(() => window.localStorage.getItem('make-believe.playerId'))
  expect(playerId).toBeTruthy()
  return { page, playerId: playerId as string, name }
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

/** Change the phase from the TV, the way somebody at the keyboard would. */
export async function pressPhaseKey(host: Host, key: 'P' | 'T' | 'D' | 'L'): Promise<void> {
  await host.page.keyboard.press(`Key${key}`)
}
