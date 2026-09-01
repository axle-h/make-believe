import type {
  HostOutboundMessage,
  HostToPlayerMessage,
  PlayerToHostMessage,
  ServerToHostMessage,
} from '@make-believe/shared'

/**
 * The relay is a single-world registry: one host, one room code, a map of
 * players. There is no room lookup and there never will be. It does no I/O —
 * `index.ts` wires real sockets to it, and tests wire fakes.
 */

export interface Connection {
  send(message: unknown): void
  close(): void
}

export type RejectReason = 'no-host' | 'wrong-room'

export type AttachPlayerResult = { ok: true } | { ok: false; reason: RejectReason }

export interface Relay {
  /** The code of the world the current host is running, or `null` if no host. */
  readonly roomCode: string | null
  readonly hasHost: boolean
  playerIds(): string[]
  attachHost(code: string, connection: Connection): void
  attachPlayer(code: string, playerId: string, connection: Connection): AttachPlayerResult
  detachHost(connection: Connection): void
  detachPlayer(playerId: string, connection: Connection): void
  routeFromPlayer(playerId: string, message: PlayerToHostMessage): boolean
  routeFromHost(message: HostOutboundMessage): boolean
}

const LOBBY: HostToPlayerMessage = { type: 'phase', value: 'lobby' }

export function createRelay(): Relay {
  let host: Connection | null = null
  let roomCode: string | null = null
  const players = new Map<string, Connection>()

  /** Send every player back to the lobby and forget them. */
  function evictAllPlayers(): void {
    for (const connection of players.values()) {
      connection.send(LOBBY)
      connection.close()
    }
    players.clear()
  }

  return {
    get roomCode() {
      return roomCode
    },

    get hasHost() {
      return host !== null
    },

    playerIds() {
      return [...players.keys()]
    },

    attachHost(code, connection) {
      const previous = host
      host = connection
      roomCode = code
      // A new host is a new world: the old TV goes, and every player rejoins
      // with the new code.
      evictAllPlayers()
      if (previous && previous !== connection) previous.close()
    },

    attachPlayer(code, playerId, connection) {
      if (host === null || roomCode === null) {
        connection.send(LOBBY)
        connection.close()
        return { ok: false, reason: 'no-host' }
      }
      if (code !== roomCode) {
        connection.send(LOBBY)
        connection.close()
        return { ok: false, reason: 'wrong-room' }
      }
      const previous = players.get(playerId)
      players.set(playerId, connection)
      if (previous && previous !== connection) previous.close()
      return { ok: true }
    },

    detachHost(connection) {
      // A host that was already replaced closing its socket must not tear down
      // the world its replacement is running.
      if (host !== connection) return
      host = null
      roomCode = null
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
