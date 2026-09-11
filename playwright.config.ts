import { defineConfig, devices } from '@playwright/test'

/** Runs against the built app on the real server, as the container does, not the Vite dev server. */
export default defineConfig({
  testDir: './e2e',
  // One world, one server: these tests share a deployment and must not overlap.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Rebuilt every run: sirv reads `web/dist` once at startup, so a stale build would be served whole.
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
  },
})
