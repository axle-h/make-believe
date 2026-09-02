import {
  generateSessionCode,
  type HostOutboundMessage,
  type HostToPlayerMessage,
  type PlayerToHostMessage,
  type ServerToHostMessage,
  type SessionMessage,
} from '@make-believe/shared'

/**
 * The relay is a single-world registry: one host, one session code, a map of
 * players. There is no room lookup and there never will be. It does no I/O —
 * `server.ts` wires real sockets to it, and tests wire fakes.
 *
 * The session code is minted here and handed to whoever connects. Nothing puts
 * it in a URL and nobody types it: a client learns it on connect and keeps it
 * only to notice, next time, that the world has been replaced.
 */

export interface Connection {
  send(message: unknown): void
  /** A code and reason travel in the close frame so the client knows why. */
  close(code?: number, reason?: string): void
}

/**
 * A second TV took over the world. The old one is told so, rather than being
 * closed quietly: a quiet close looks like a network blip, and the old TV would
 * reconnect, take the world back, and the two would fight over it forever.
 */
export const CLOSE_REPLACED = 4002

/**
 * The one thing that can stop a phone attaching. A stale session is not on
 * this list: the relay lets that phone in and tells it the current code, which
 * is its cue to come back as a new player.
 */
export type RejectReason = 'no-host'

export type AttachPlayerResult = { ok: true } | { ok: false; reason: RejectReason }

export interface Relay {
  /** The code of the world the current host is running, or `null` if no host. */
  readonly session: string | null
  readonly hasHost: boolean
  playerIds(): string[]
  /** Take the world for this socket under a fresh session code, and return it. */
  attachHost(connection: Connection): string
  /**
   * Register a player and tell it which world it has reached. On `{ ok: false }`
   * the connection has been sent the waiting message but is left open: the
   * caller closes it, so it can say why.
   */
  attachPlayer(playerId: string, connection: Connection): AttachPlayerResult
  detachHost(connection: Connection): void
  detachPlayer(playerId: string, connection: Connection): void
  routeFromPlayer(playerId: string, message: PlayerToHostMessage): boolean
  routeFromHost(message: HostOutboundMessage): boolean
}

/**
 * "There is no TV for you." The only thing the relay says to a phone on its own
 * account: the phone shows its waiting screen and keeps trying until a TV
 * answers.
 */
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

  /** Send every player back to its waiting screen and forget them. */
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

    /**
     * A TV takes the world. Every attach is a new world — a TV that has
     * reloaded has forgotten every blob on it — so it always mints a fresh
     * code, and every phone still holding a socket is told the new one. That
     * message is what sends them back in as new players; without it they would
     * have to sit and knock until somebody noticed.
     */
    attachHost(connection) {
      const previous = host
      host = connection
      session = mint()
      announceSession(connection)
      for (const player of players.values()) announceSession(player)
      if (previous && previous !== connection) previous.close(CLOSE_REPLACED, 'replaced')
      return session
    },

    /**
     * A phone attaches. It is never turned away for the code it is holding —
     * it is simply told which world this is, and it is the phone that works
     * out whether that makes it somebody new. The only refusal is that there
     * is no TV yet.
     *
     * A rejected connection is told to wait but is left open: the caller closes
     * it, so that it can say why in the close frame.
     */
    attachPlayer(playerId, connection) {
      if (host === null || session === null) {
        connection.send(WAITING)
        return { ok: false, reason: 'no-host' }
      }
      const previous = players.get(playerId)
      players.set(playerId, connection)
      if (previous && previous !== connection) previous.close()
      announceSession(connection)
      return { ok: true }
    },

    detachHost(connection) {
      // A host that was already replaced closing its socket must not tear down
      // the world its replacement is running.
      if (host !== connection) return
      host = null
      session = null
      evictAllPlayers()
    },

    detachPlayer(playerId, connection) {
      if (players.get(playerId) !== connection) return
      players.delete(playerId)
      const left: ServerToHostMessage = { type: 'left', playerId }
      host?.send(left)
    },

    routeFromPlayer(playerId, message) {
      if (host === null) return false
      if (!players.has(playerId)) return false
      // The socket, not the payload, decides who this came from.
      const tagged: ServerToHostMessage = { ...message, playerId }
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
