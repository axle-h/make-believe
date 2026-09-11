import { expect, test } from '@playwright/test'

/** What a phone needs before it offers to install the player page; installing cannot be tested here. */
test.describe('the phone app', () => {
  test('serves a manifest the player page links to', async ({ page, request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/manifest+json')

    const manifest = JSON.parse(await response.text())
    expect(manifest).toMatchObject({
      name: 'MAKE believe',
      start_url: '/',
      scope: '/',
      display: 'fullscreen',
    })

    // A missing icon costs the install prompt with no other sign that anything is wrong.
    const images = await Promise.all(manifest.icons.map((icon) => request.get(icon.src)))
    for (const [index, image] of images.entries()) {
      const { src } = manifest.icons[index]
      expect(image.status(), `${src} is missing`).toBe(200)
      expect(image.headers()['content-type'], src).toContain('image/png')
    }
    const purposes = manifest.icons.flatMap((icon) => String(icon.purpose ?? 'any').split(' '))
    expect(purposes).toContain('any')
    expect(purposes).toContain('maskable')

    await page.goto('/')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    )
  })

  test('registers a worker for the build the server is serving', async ({ page, request }) => {
    const version = (await (await request.get('/version')).text()).trim()
    // `unknown` would leave every phone unable to spot a deploy.
    expect(version).not.toBe('unknown')
    expect(version).not.toBe('')

    const worker = await request.get('/sw.js')
    expect(worker.status()).toBe(200)
    expect(worker.headers()['content-type']).toContain('javascript')

    await page.goto('/')
    const scriptURL = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return registration.active?.scriptURL ?? ''
    })
    // The build in the worker's URL is how a deploy becomes a new worker and names its cache.
    expect(scriptURL).toContain(`/sw.js?v=${version}`)
  })

  test('leaves the TV out of it', async ({ page }) => {
    // The TV has its own wrapper; an installed TV page would be a second way in.
    await page.goto('/host/')
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
  })
})
