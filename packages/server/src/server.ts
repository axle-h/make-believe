import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import sirv from 'sirv'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  HostOutboundMessageSchema,
  PlayerIdSchema,
  PlayerToHostMessageSchema,
  isValidRoomCode,
  normaliseRoomCode,
  parseMessage,
} from '@make-believe/shared'
import { createRelay, type Connection, type Relay } from './relay.js'

/** Close codes we use to tell a client why we hung up. */
const CLOSE_BAD_REQUEST = 4000
const CLOSE_REJECTED = 4001

export interface StartedServer {
  server: Server
  relay: Relay
  port: number
  close(): Promise<void>
}

/**
 * Where the built web pages live. In the container the server is at
 * `/app/server/index.js` and the pages at `/app/web/`; in the repo the server
 * runs from `packages/server/{src,dist}` and the pages are in
 * `packages/web/dist`.
 */
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

export function buildServer(): { server: Server; relay: Relay } {
  const relay = createRelay()
  const webDist = findWebDist()
  const serveStatic = webDist ? sirv(webDist, { single: false, etag: true }) : null
  if (!webDist) {
    console.warn('[make-believe] no built web pages found; serving the api only')
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
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
    close() {
      ws.close()
    },
  }
}

function handleConnection(relay: Relay, ws: WebSocket, params: URLSearchParams): void {
  const role = params.get('role')
  const room = normaliseRoomCode(params.get('room') ?? '')

  if (!isValidRoomCode(room)) {
    ws.close(CLOSE_BAD_REQUEST, 'bad room code')
    return
  }

  if (role === 'host') {
    attachHostSocket(relay, ws, room)
    return
  }

  if (role === 'player') {
    attachPlayerSocket(relay, ws, room, params.get('playerId'))
    return
  }

  ws.close(CLOSE_BAD_REQUEST, 'bad role')
}

function attachHostSocket(relay: Relay, ws: WebSocket, room: string): void {
  const connection = toConnection(ws)
  relay.attachHost(room, connection)

  ws.on('message', (data) => {
    const message = parseMessage(HostOutboundMessageSchema, data.toString())
    if (!message) return
    relay.routeFromHost(message)
  })
  ws.on('close', () => {
    relay.detachHost(connection)
  })
}

function attachPlayerSocket(
  relay: Relay,
  ws: WebSocket,
  room: string,
  rawPlayerId: string | null,
): void {
  const parsedId = PlayerIdSchema.safeParse(rawPlayerId)
  if (!parsedId.success) {
    ws.close(CLOSE_BAD_REQUEST, 'bad playerId')
    return
  }
  const playerId = parsedId.data
  const connection = toConnection(ws)

  const attached = relay.attachPlayer(room, playerId, connection)
  if (!attached.ok) {
    // The relay has already told the phone to show the lobby.
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
