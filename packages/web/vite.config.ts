import { execSync } from 'node:child_process'
import process from 'node:process'
import { defineConfig, type Plugin } from 'vite'

/** The container build has no `.git`, so it is given `BUILD_VERSION`; the clock is last. */
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

/** Written beside the pages so the server serves the same build string at `/version`. */
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
