import {
  generateSessionCode,
  type HostInboundMessage,
  type HostOutboundMessage,
  type HostToPlayerMessage,
  type PlayerToHostMessage,
  type ServerToHostMessage,
  type SessionMessage,
} from '@make-believe/shared'

// A single-world registry with no I/O: one host, one session code, a map of players. There are no
// rooms and never will be; `server.ts` wires real sockets to it and tests wire fakes.

export interface Connection {
  send(message: unknown): void
  close(code?: number, reason?: string): void
}

// Sent to a replaced TV. A quiet close would look like a blip, and the old TV would reconnect and
// the two would fight over the world for ever.
export const CLOSE_REPLACED = 4002

/** No TV is the only refusal; a phone is never turned away for a stale session code. */
export type RejectReason = 'no-host'

export type AttachPlayerResult = { ok: true } | { ok: false; reason: RejectReason }

export interface Relay {
  readonly session: string | null
  readonly hasHost: boolean
  playerIds(): string[]
  attachHost(connection: Connection): string
  /** On `{ ok: false }` the connection is sent `waiting` but left open, so the caller can say why. */
  attachPlayer(playerId: string, connection: Connection): AttachPlayerResult
  detachHost(connection: Connection): void
  detachPlayer(playerId: string, connection: Connection): void
  routeFromPlayer(playerId: string, message: PlayerToHostMessage): boolean
  routeFromHost(message: HostOutboundMessage): boolean
}

const WAITING: HostToPlayerMessage = { type: 'waiting' }

/** `mint` is injected so tests get a session code they can predict. */
export function createRelay(mint: () => string = generateSessionCode): Relay {
  let host: Connection | null = null
  let session: string | null = null
  const players = new Map<string, Connection>()

  function announceSession(connection: Connection): void {
    if (session === null) return
    const message: SessionMessage = { type: 'session', session }
    connection.send(message)
  }

  function evictAllPlayers(): void {
    for (const connection of players.values()) {
      connection.send(WAITING)
      connection.close()
    }
    players.clear()
  }

  return {
    get session() {
      return session
    },

    get hasHost() {
      return host !== null
    },

    playerIds() {
      return [...players.keys()]
    },

    // Every attach is a new world, so it mints a fresh code and tells every phone still on a
    // socket, which is what sends them back in as new players.
    attachHost(connection) {
      const previous = host
      host = connection
      session = mint()
      announceSession(connection)
      for (const player of players.values()) announceSession(player)
      if (previous && previous !== connection) previous.close(CLOSE_REPLACED, 'replaced')
      return session
    },

    // Never turned away for the code it holds: it is told which world this is and works out
    // for itself whether that makes it somebody new. The only refusal is no TV.
    attachPlayer(playerId, connection) {
      if (host === null || session === null) {
        connection.send(WAITING)
        return { ok: false, reason: 'no-host' }
      }
      const previous = players.get(playerId)
      players.set(playerId, connection)
      if (previous && previous !== connection) previous.close()
      announceSession(connection)
      // A socket, not yet a blob: the TV's cue to answer with the palette.
      const arrived: HostInboundMessage = { type: 'arrived', playerId }
      host.send(arrived)
      return { ok: true }
    },

    detachHost(connection) {
      // A replaced host closing late must not tear down its replacement's world. Otherwise the
      // world is gone and every phone goes back to waiting.
      if (host !== connection) return
      host = null
      session = null
      evictAllPlayers()
    },

    detachPlayer(playerId, connection) {
      if (players.get(playerId) !== connection) return
      players.delete(playerId)
      // Unlike `arrived`, this is a blob going quiet: the world keeps it standing, away.
      const left: ServerToHostMessage = { type: 'left', playerId }
      host?.send(left)
    },

    routeFromPlayer(playerId, message) {
      if (host === null) return false
      if (!players.has(playerId)) return false
      // The socket, not the payload, decides who is speaking, which is what makes a grown-up's
      // `command` safe: a phone cannot claim somebody else's `playerId`.
      const tagged: HostInboundMessage = { ...message, playerId }
      host.send(tagged)
      return true
    },

    routeFromHost(message) {
      const { to, ...rest } = message
      const forwarded = rest as HostToPlayerMessage
      if (to === '*') {
        for (const connection of players.values()) connection.send(forwarded)
        return true
      }
      const player = players.get(to)
      if (!player) return false
      player.send(forwarded)
      return true
    },
  }
}
