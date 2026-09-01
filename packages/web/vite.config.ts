import { defineConfig } from 'vite'

/**
 * One project, two pages: the player page at `/` and the host page at `/host/`.
 * Vite code-splits per entry, so nothing the TV needs ever ships to a phone.
 */
export default defineConfig({
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
