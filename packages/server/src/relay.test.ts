import { beforeEach, describe, expect, it } from 'vitest'
import type { Connection, Relay } from './relay.js'
import { createRelay } from './relay.js'

interface Fake extends Connection {
  sent: unknown[]
  closed: boolean
}

function fakeConnection(): Fake {
  const fake: Fake = {
    sent: [],
    closed: false,
    send(message) {
      fake.sent.push(message)
    },
    close() {
      fake.closed = true
    },
  }
  return fake
}

const lobby = { type: 'phase', value: 'lobby' }

describe('relay', () => {
  let relay: Relay
  let host: Fake

  beforeEach(() => {
    relay = createRelay()
    host = fakeConnection()
  })

  it('starts with no host and no room code', () => {
    expect(relay.hasHost).toBe(false)
    expect(relay.roomCode).toBeNull()
    expect(relay.playerIds()).toEqual([])
  })

  it('attaches a host and takes its room code', () => {
    relay.attachHost('ABCD', host)
    expect(relay.hasHost).toBe(true)
    expect(relay.roomCode).toBe('ABCD')
  })

  it('forwards a player input to the host tagged with the playerId', () => {
    relay.attachHost('ABCD', host)
    const one = fakeConnection()
    const two = fakeConnection()
    expect(relay.attachPlayer('ABCD', 'p1', one)).toEqual({ ok: true })
    expect(relay.attachPlayer('ABCD', 'p2', two)).toEqual({ ok: true })
    expect(relay.playerIds()).toEqual(['p1', 'p2'])

    relay.routeFromPlayer('p2', { type: 'input', playerId: 'p2', dx: 1, dy: 0 })

    expect(host.sent).toEqual([{ type: 'input', playerId: 'p2', dx: 1, dy: 0 }])
  })

  it('tags a forwarded message with the connection it came from, not the claim in it', () => {
    relay.attachHost('ABCD', host)
    const one = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', one)

    relay.routeFromPlayer('p1', { type: 'input', playerId: 'imposter', dx: 0, dy: 1 })

    expect(host.sent).toEqual([{ type: 'input', playerId: 'p1', dx: 0, dy: 1 }])
  })

  it('drops player messages from an unregistered player and when there is no host', () => {
    expect(relay.routeFromPlayer('p1', { type: 'input', playerId: 'p1', dx: 0, dy: 0 })).toBe(false)
    relay.attachHost('ABCD', host)
    expect(relay.routeFromPlayer('ghost', { type: 'input', playerId: 'ghost', dx: 0, dy: 0 })).toBe(
      false,
    )
    expect(host.sent).toEqual([])
  })

  it('sends a host message to one player, stripping the recipient', () => {
    relay.attachHost('ABCD', host)
    const one = fakeConnection()
    const two = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', one)
    relay.attachPlayer('ABCD', 'p2', two)

    expect(relay.routeFromHost({ type: 'assigned', colour: '#f00', slot: 0, to: 'p1' })).toBe(true)

    expect(one.sent).toEqual([{ type: 'assigned', colour: '#f00', slot: 0 }])
    expect(two.sent).toEqual([])
  })

  it('fans a host message out on *', () => {
    relay.attachHost('ABCD', host)
    const one = fakeConnection()
    const two = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', one)
    relay.attachPlayer('ABCD', 'p2', two)

    expect(relay.routeFromHost({ type: 'phase', value: 'play', to: '*' })).toBe(true)

    expect(one.sent).toEqual([{ type: 'phase', value: 'play' }])
    expect(two.sent).toEqual([{ type: 'phase', value: 'play' }])
  })

  it('drops a host message addressed to a player who is not here', () => {
    relay.attachHost('ABCD', host)
    expect(relay.routeFromHost({ type: 'phase', value: 'play', to: 'nobody' })).toBe(false)
  })

  it('rejects a player whose room code does not match', () => {
    relay.attachHost('ABCD', host)
    const stale = fakeConnection()

    expect(relay.attachPlayer('WXYZ', 'p1', stale)).toEqual({ ok: false, reason: 'wrong-room' })

    expect(stale.sent).toEqual([lobby])
    // Left open on purpose: the caller closes it with the reason in the frame.
    expect(stale.closed).toBe(false)
    expect(relay.playerIds()).toEqual([])
  })

  it('rejects a player who connects before any host', () => {
    const early = fakeConnection()

    expect(relay.attachPlayer('ABCD', 'p1', early)).toEqual({ ok: false, reason: 'no-host' })

    expect(early.sent).toEqual([lobby])
    expect(early.closed).toBe(false)
  })

  it('replaces a player reconnecting with the same id', () => {
    relay.attachHost('ABCD', host)
    const first = fakeConnection()
    const second = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', first)
    relay.attachPlayer('ABCD', 'p1', second)

    expect(first.closed).toBe(true)
    expect(relay.playerIds()).toEqual(['p1'])
    relay.routeFromHost({ type: 'phase', value: 'play', to: 'p1' })
    expect(second.sent).toEqual([{ type: 'phase', value: 'play' }])
  })

  it('tells the host when a player disconnects', () => {
    relay.attachHost('ABCD', host)
    const one = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', one)

    relay.detachPlayer('p1', one)

    expect(host.sent).toEqual([{ type: 'left', playerId: 'p1' }])
    expect(relay.playerIds()).toEqual([])
  })

  it('ignores a stale player socket closing after it was replaced', () => {
    relay.attachHost('ABCD', host)
    const first = fakeConnection()
    const second = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', first)
    relay.attachPlayer('ABCD', 'p1', second)

    relay.detachPlayer('p1', first)

    expect(host.sent).toEqual([])
    expect(relay.playerIds()).toEqual(['p1'])
  })

  it('tears the world down when the host disconnects', () => {
    relay.attachHost('ABCD', host)
    const one = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', one)

    relay.detachHost(host)

    expect(one.sent).toEqual([lobby])
    expect(one.closed).toBe(true)
    expect(relay.hasHost).toBe(false)
    expect(relay.roomCode).toBeNull()
    expect(relay.playerIds()).toEqual([])
  })

  it('replaces the host on a TV refresh and sends the old players back to the lobby', () => {
    relay.attachHost('ABCD', host)
    const one = fakeConnection()
    relay.attachPlayer('ABCD', 'p1', one)

    const second = fakeConnection()
    relay.attachHost('WXYZ', second)

    expect(host.closed).toBe(true)
    expect(one.sent).toEqual([lobby])
    expect(one.closed).toBe(true)
    expect(relay.roomCode).toBe('WXYZ')
    expect(relay.playerIds()).toEqual([])

    const rejoin = fakeConnection()
    expect(relay.attachPlayer('WXYZ', 'p1', rejoin)).toEqual({ ok: true })
    relay.routeFromPlayer('p1', { type: 'join', playerId: 'p1', name: 'Wilf' })
    expect(second.sent).toEqual([{ type: 'join', playerId: 'p1', name: 'Wilf' }])
  })

  it('ignores a stale host socket closing after it was replaced', () => {
    relay.attachHost('ABCD', host)
    const second = fakeConnection()
    relay.attachHost('WXYZ', second)

    relay.detachHost(host)

    expect(relay.hasHost).toBe(true)
    expect(relay.roomCode).toBe('WXYZ')
  })
})
