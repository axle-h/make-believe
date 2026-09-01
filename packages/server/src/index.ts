import { startServer } from './server.js'

const { port } = await startServer()
console.log(`[make-believe] listening on http://0.0.0.0:${port}`)
