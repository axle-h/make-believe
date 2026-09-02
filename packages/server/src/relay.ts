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
  /** A code and reason travel in the close frame so the client knows why. */
  close(code?: number, reason?: string): void
}

/**
 * A second TV took over the world. The old one is told so, rather than being
 * closed quietly: a quiet close looks like a network blip, and the old TV would
 * reconnect, take the world back, and the two would fight over it forever.
 */
export const CLOSE_REPLACED = 4002

export type RejectReason = 'no-host' | 'wrong-room'

export type AttachPlayerResult = { ok: true } | { ok: false; reason: RejectReason }

export interface Relay {
  /** The code of the world the current host is running, or `null` if no host. */
  readonly roomCode: string | null
  readonly hasHost: boolean
  playerIds(): string[]
  attachHost(code: string, connection: Connection): void
  /**
   * Register a player. On `{ ok: false }` the connection has been sent the
   * waiting message but is left open: the caller closes it, so it can say why.
   */
  attachPlayer(code: string, playerId: string, connection: Connection): AttachPlayerResult
  detachHost(connection: Connection): void
  detachPlayer(playerId: string, connection: Connection): void
  routeFromPlayer(playerId: string, message: PlayerToHostMessage): boolean
  routeFromHost(message: HostOutboundMessage): boolean
}

/**
 * "There is no TV for you." The only thing the relay says to a phone on its own
 * account: the phone shows its waiting screen and knocks until a TV answers.
 */
const WAITING: HostToPlayerMessage = { type: 'waiting' }

export function createRelay(): Relay {
  let host: Connection | null = null
  let roomCode: string | null = null
  const players = new Map<string, Connection>()

  /** Send every player back to its waiting screen and forget them. */
  function evictAllPlayers(): void {
    for (const connection of players.values()) {
      connection.send(WAITING)
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
      // The same code from a new socket is the same TV coming back — a reload,
      // or a connection that dropped. The phones keep their sockets and are
      // told to wait, which is their cue to knock again; a TV that arrives with
      // a different code is a new world and clears the room.
      const sameSession = previous !== null && roomCode === code
      host = connection
      roomCode = code
      if (sameSession) {
        for (const player of players.values()) player.send(WAITING)
      } else {
        evictAllPlayers()
      }
      if (previous && previous !== connection) previous.close(CLOSE_REPLACED, 'replaced')
    },

    attachPlayer(code, playerId, connection) {
      // A rejected connection is told to wait but is left open: the caller
      // closes it, so that it can say *why* in the close frame. The
      // phone needs that reason to tell "the TV is not here yet" (wait and
      // knock again) from "the TV has a different code now" (give up, ask).
      if (host === null || roomCode === null) {
        connection.send(WAITING)
        return { ok: false, reason: 'no-host' }
      }
      if (code !== roomCode) {
        connection.send(WAITING)
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
