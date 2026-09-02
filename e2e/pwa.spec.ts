import { expect, test } from '@playwright/test'

/**
 * The phone installs the player page as an app. Installability itself cannot
 * be tested from Playwright, so this asserts the parts a phone needs before it
 * will offer it: a manifest served as one, icons that are really there, and
 * the link from the player page only.
 */
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

    // Every icon the manifest promises exists, maskable included — a missing
    // one costs the install prompt with no other sign that anything is wrong.
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
    // `unknown` is what the server answers when the build left no version
    // beside the pages, which would leave every phone unable to spot a deploy.
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
    // The build is in the worker's own URL: that is how a deploy becomes a new
    // worker, and how the worker knows what to call its cache.
    expect(scriptURL).toContain(`/sw.js?v=${version}`)
  })

  test('leaves the TV out of it', async ({ page }) => {
    // The host is not installable and never should be: the TV has its own
    // wrapper, and an installed TV page would be a second way in.
    await page.goto('/host/')
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
  })
})
