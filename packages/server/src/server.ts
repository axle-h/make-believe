import { existsSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import sirv from 'sirv'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  HostOutboundMessageSchema,
  PlayerIdSchema,
  PlayerToHostMessageSchema,
  parseMessage,
} from '@make-believe/shared'
import { createRelay, type Connection, type Relay } from './relay.js'

const CLOSE_BAD_REQUEST = 4000
const CLOSE_REJECTED = 4001

export interface StartedServer {
  server: Server
  relay: Relay
  port: number
  close(): Promise<void>
}

/** The container has `/app/server/index.mjs` beside `/app/web/`; the repo has `packages/web/dist`. */
export function findWebDist(scriptPath = process.argv[1] ?? process.cwd()): string | null {
  const fromEnv = process.env['WEB_DIST']
  const scriptDir = dirname(resolve(scriptPath))
  const candidates = [
    ...(fromEnv ? [resolve(fromEnv)] : []),
    resolve(scriptDir, '../web'),
    resolve(scriptDir, '../../web/dist'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

// Only hashed `/assets/*` may be kept without asking. Everything else is revalidated, or a phone
// can hold yesterday's page across a deploy and never find out.
function setHeaders(res: ServerResponse, pathname: string): void {
  const forever = pathname.startsWith('/assets/')
  res.setHeader('cache-control', forever ? 'public, max-age=31536000, immutable' : 'no-cache')
}

/** Read from beside the pages the web build wrote, so the page and `/version` can never disagree. */
export function readBuildVersion(webDist: string | null): string {
  if (!webDist) return 'unknown'
  try {
    return readFileSync(resolve(webDist, 'version.txt'), 'utf8').trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function buildServer(): { server: Server; relay: Relay } {
  const relay = createRelay()
  const webDist = findWebDist()
  const serveStatic = webDist ? sirv(webDist, { single: false, etag: true, setHeaders }) : null
  if (!webDist) {
    console.warn('[make-believe] no built web pages found; serving the api only')
  }
  const version = readBuildVersion(webDist)

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }
    // Never cached: a stale answer here is worse than none.
    if (req.method === 'GET' && req.url === '/version') {
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
      res.end(version)
      return
    }
    if (serveStatic) {
      serveStatic(req, res, () => {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
      })
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })

  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(relay, ws, url.searchParams)
    })
  })

  server.on('close', () => {
    wss.close()
  })

  return { server, relay }
}

function toConnection(ws: WebSocket): Connection {
  return {
    send(message) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
    },
    close(code, reason) {
      ws.close(code, reason)
    },
  }
}

/** No session code in the query: the relay answers with it on the way in, and that is the negotiation. */
function handleConnection(relay: Relay, ws: WebSocket, params: URLSearchParams): void {
  const role = params.get('role')

  if (role === 'host') {
    attachHostSocket(relay, ws)
    return
  }

  if (role === 'player') {
    attachPlayerSocket(relay, ws, params.get('playerId'))
    return
  }

  ws.close(CLOSE_BAD_REQUEST, 'bad role')
}

function attachHostSocket(relay: Relay, ws: WebSocket): void {
  const connection = toConnection(ws)
  relay.attachHost(connection)

  ws.on('message', (data) => {
    const message = parseMessage(HostOutboundMessageSchema, data.toString())
    if (!message) return
    relay.routeFromHost(message)
  })
  ws.on('close', () => {
    relay.detachHost(connection)
  })
}

function attachPlayerSocket(relay: Relay, ws: WebSocket, rawPlayerId: string | null): void {
  const parsedId = PlayerIdSchema.safeParse(rawPlayerId)
  if (!parsedId.success) {
    ws.close(CLOSE_BAD_REQUEST, 'bad playerId')
    return
  }
  const playerId = parsedId.data
  const connection = toConnection(ws)

  const attached = relay.attachPlayer(playerId, connection)
  if (!attached.ok) {
    // The relay has already told the phone to show its waiting screen.
    ws.close(CLOSE_REJECTED, attached.reason)
    return
  }

  ws.on('message', (data) => {
    const message = parseMessage(PlayerToHostMessageSchema, data.toString())
    if (!message) return
    relay.routeFromPlayer(playerId, message)
  })
  ws.on('close', () => {
    relay.detachPlayer(playerId, connection)
  })
}

export function startServer(port = Number(process.env['PORT'] ?? 3000)): Promise<StartedServer> {
  const { server, relay } = buildServer()
  return new Promise((resolvePromise) => {
    server.listen(port, '0.0.0.0', () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      resolvePromise({
        server,
        relay,
        port: boundPort,
        close: () =>
          new Promise<void>((done, fail) => {
            server.closeAllConnections()
            server.close((error) => (error ? fail(error) : done()))
          }),
      })
    })
  })
}
