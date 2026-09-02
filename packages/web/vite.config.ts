import { execSync } from 'node:child_process'
import process from 'node:process'
import { defineConfig, type Plugin } from 'vite'

/**
 * One project, two pages: the player page at `/` and the host page at `/host/`.
 * Vite code-splits per entry, so nothing the TV needs ever ships to a phone.
 */

/**
 * What this build is. The phone compares it with `/version` to notice a deploy
 * while it is open, and the service worker names its cache after it.
 *
 * The container build has no `.git`, so CI passes `BUILD_VERSION` in; a build
 * with neither falls back to the clock, which is just as unique and just as
 * opaque — nothing ever compares two versions for order, only for sameness.
 */
function buildVersion(): string {
  const given = process.env['BUILD_VERSION']
  if (given) return given
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return String(Date.now())
  }
}

/**
 * Writes the version beside the pages so the server can serve it at `/version`.
 * Both halves of the answer then come from one build and cannot disagree.
 */
function versionFile(version: string): Plugin {
  let written = false
  return {
    name: 'make-believe:version',
    generateBundle() {
      if (written) return
      written = true
      this.emitFile({ type: 'asset', fileName: 'version.txt', source: version })
    },
  }
}

const version = buildVersion()

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(version),
  },
  plugins: [versionFile(version)],
  server: {
    // Bind to the LAN so phones can reach the dev server.
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    target: 'es2022',
    // Phaser is a megabyte on its own and only the TV ever loads it.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        player: 'index.html',
        host: 'host/index.html',
      },
    },
  },
})
