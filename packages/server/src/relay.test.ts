import { beforeEach, describe, expect, it } from 'vitest'
import type { Connection, Relay } from './relay.js'
import { CLOSE_REPLACED, createRelay } from './relay.js'

interface Fake extends Connection {
  sent: unknown[]
  closed: boolean
  closedWith: { code?: number | undefined; reason?: string | undefined } | null
  /** Forget what has been said so far, so an assertion can start from here. */
  clear(): void
}

function fakeConnection(): Fake {
  const fake: Fake = {
    sent: [],
    closed: false,
    closedWith: null,
    send(message) {
      fake.sent.push(message)
    },
    close(code, reason) {
      fake.closed = true
      fake.closedWith = { code, reason }
    },
    clear() {
      fake.sent.length = 0
    },
  }
  return fake
}

const waiting = { type: 'waiting' }
const session = (code: string) => ({ type: 'session', session: code })
/** What the host says back to a hello, minus the recipient the relay strips. */
const assigned = { type: 'assigned', colour: '#0f0', slot: 1, hasDrawing: false } as const
const brief = { type: 'brief', headline: 'Everybody on the spot!', tone: 'task' } as const

describe('relay', () => {
  let relay: Relay
  let host: Fake

  beforeEach(() => {
    // Predictable session codes: AAAA for the first TV, BBBB for the next.
    let minted = 0
    relay = createRelay(() => 'ABCDEFGH'[minted++]!.repeat(4))
    host = fakeConnection()
  })

  it('starts with no host and no session', () => {
    expect(relay.hasHost).toBe(false)
    expect(relay.session).toBeNull()
    expect(relay.playerIds()).toEqual([])
  })

  it('mints a session for a host and tells it which one', () => {
    expect(relay.attachHost(host)).toBe('AAAA')
    expect(relay.hasHost).toBe(true)
    expect(relay.session).toBe('AAAA')
    expect(host.sent).toEqual([session('AAAA')])
  })

  /**
   * A TV that reloads has forgotten every blob on it, so there is no such
   * thing as the same world coming back. Every attach is a new one, and that
   * is exactly what the phones need to be told.
   */
  it('mints a fresh session for every TV that attaches', () => {
    relay.attachHost(host)
    expect(relay.attachHost(fakeConnection())).toBe('BBBB')
    expect(relay.session).toBe('BBBB')
  })

  it('tells a player which world it has reached', () => {
    relay.attachHost(host)
    const one = fakeConnection()

    expect(relay.attachPlayer('p1', one)).toEqual({ ok: true })

    expect(one.sent).toEqual([session('AAAA')])
  })

  /**
   * The relay does not know or care what a phone was holding: it says which
   * world this is and the phone works out whether that makes it somebody new.
   * There is nothing left to be turned away for.
   */
  it('lets a phone in whatever world it came from', () => {
    relay.attachHost(host)
    relay.attachHost(fakeConnection())
    const stale = fakeConnection()

    expect(relay.attachPlayer('p1', stale)).toEqual({ ok: true })

    expect(stale.sent).toEqual([session('BBBB')])
    expect(stale.closed).toBe(false)
    expect(relay.playerIds()).toEqual(['p1'])
  })

  it('forwards a player input to the host tagged with the playerId', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    const two = fakeConnection()
    expect(relay.attachPlayer('p1', one)).toEqual({ ok: true })
    expect(relay.attachPlayer('p2', two)).toEqual({ ok: true })
    expect(relay.playerIds()).toEqual(['p1', 'p2'])
    host.clear()

    relay.routeFromPlayer('p2', { type: 'input', playerId: 'p2', dx: 1, dy: 0 })

    expect(host.sent).toEqual([{ type: 'input', playerId: 'p2', dx: 1, dy: 0 }])
  })

  it('tags a forwarded message with the connection it came from, not the claim in it', () => {
    relay.attachHost(host)
    relay.attachPlayer('p1', fakeConnection())
    host.clear()

    relay.routeFromPlayer('p1', { type: 'input', playerId: 'imposter', dx: 0, dy: 1 })

    expect(host.sent).toEqual([{ type: 'input', playerId: 'p1', dx: 0, dy: 1 }])
  })

  /**
   * A phone that has finished is still an ordinary phone as far as the relay is
   * concerned: it forwards the message and takes no view. Whether the world
   * forgets that blob is the TV's business, and the socket closing behind it is
   * an ordinary `left`.
   */
  it('forwards a phone finishing like anything else it says', () => {
    relay.attachHost(host)
    const connection = fakeConnection()
    relay.attachPlayer('p1', connection)
    host.clear()

    relay.routeFromPlayer('p1', { type: 'finish', playerId: 'p1' })
    relay.detachPlayer('p1', connection)

    expect(host.sent).toEqual([
      { type: 'finish', playerId: 'p1' },
      { type: 'left', playerId: 'p1' },
    ])
  })

  it('drops player messages from an unregistered player and when there is no host', () => {
    expect(relay.routeFromPlayer('p1', { type: 'input', playerId: 'p1', dx: 0, dy: 0 })).toBe(false)
    relay.attachHost(host)
    host.clear()
    expect(relay.routeFromPlayer('ghost', { type: 'input', playerId: 'ghost', dx: 0, dy: 0 })).toBe(
      false,
    )
    expect(host.sent).toEqual([])
  })

  it('sends a host message to one player, stripping the recipient', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    const two = fakeConnection()
    relay.attachPlayer('p1', one)
    relay.attachPlayer('p2', two)
    one.clear()
    two.clear()

    expect(relay.routeFromHost({ ...assigned, to: 'p1' })).toBe(true)

    expect(one.sent).toEqual([assigned])
    expect(two.sent).toEqual([])
  })

  it('fans a host message out on *', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    const two = fakeConnection()
    relay.attachPlayer('p1', one)
    relay.attachPlayer('p2', two)
    one.clear()
    two.clear()

    expect(relay.routeFromHost({ ...assigned, to: '*' })).toBe(true)

    expect(one.sent).toEqual([assigned])
    expect(two.sent).toEqual([assigned])
  })

  /**
   * The relay forwards by `to` and does not look at the rest, so a brief
   * travels exactly as an assignment does. It is the whole of what objectives
   * cost the server.
   */
  it('fans a brief out to every phone without knowing what one is', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    const two = fakeConnection()
    relay.attachPlayer('p1', one)
    relay.attachPlayer('p2', two)
    one.clear()
    two.clear()

    expect(relay.routeFromHost({ ...brief, to: '*' })).toBe(true)

    expect(one.sent).toEqual([brief])
    expect(two.sent).toEqual([brief])
  })

  it('sends a private brief to the one phone it is for', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    const two = fakeConnection()
    relay.attachPlayer('p1', one)
    relay.attachPlayer('p2', two)
    one.clear()
    two.clear()

    expect(relay.routeFromHost({ ...brief, detail: 'Yours is the green one', to: 'p2' })).toBe(true)

    expect(one.sent).toEqual([])
    expect(two.sent).toEqual([{ ...brief, detail: 'Yours is the green one' }])
  })

  it('drops a host message addressed to a player who is not here', () => {
    relay.attachHost(host)
    expect(relay.routeFromHost({ ...assigned, to: 'nobody' })).toBe(false)
  })

  it('rejects a player who connects before any host', () => {
    const early = fakeConnection()

    expect(relay.attachPlayer('p1', early)).toEqual({ ok: false, reason: 'no-host' })

    expect(early.sent).toEqual([waiting])
    // Left open on purpose: the caller closes it with the reason in the frame.
    expect(early.closed).toBe(false)
  })

  it('replaces a player reconnecting with the same id', () => {
    relay.attachHost(host)
    const first = fakeConnection()
    const second = fakeConnection()
    relay.attachPlayer('p1', first)
    relay.attachPlayer('p1', second)
    second.clear()

    expect(first.closed).toBe(true)
    expect(relay.playerIds()).toEqual(['p1'])
    relay.routeFromHost({ ...assigned, to: 'p1' })
    expect(second.sent).toEqual([assigned])
  })

  it('tells the host when a player disconnects', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    relay.attachPlayer('p1', one)
    host.clear()

    relay.detachPlayer('p1', one)

    expect(host.sent).toEqual([{ type: 'left', playerId: 'p1' }])
    expect(relay.playerIds()).toEqual([])
  })

  it('ignores a stale player socket closing after it was replaced', () => {
    relay.attachHost(host)
    const first = fakeConnection()
    const second = fakeConnection()
    relay.attachPlayer('p1', first)
    relay.attachPlayer('p1', second)
    host.clear()

    relay.detachPlayer('p1', first)

    expect(host.sent).toEqual([])
    expect(relay.playerIds()).toEqual(['p1'])
  })

  it('tears the world down when the host disconnects', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    relay.attachPlayer('p1', one)
    one.clear()

    relay.detachHost(host)

    expect(one.sent).toEqual([waiting])
    expect(one.closed).toBe(true)
    expect(relay.hasHost).toBe(false)
    expect(relay.session).toBeNull()
    expect(relay.playerIds()).toEqual([])
  })

  /**
   * The phones keep their sockets through a TV taking over. They are simply
   * told the new session, which is their cue to come back as new players —
   * without it they would have to sit and knock until somebody noticed.
   */
  it('tells every phone the new session when a TV takes the world', () => {
    relay.attachHost(host)
    const one = fakeConnection()
    const two = fakeConnection()
    relay.attachPlayer('p1', one)
    relay.attachPlayer('p2', two)
    one.clear()
    two.clear()

    const second = fakeConnection()
    relay.attachHost(second)

    expect(host.closed).toBe(true)
    expect(one.closed).toBe(false)
    expect(two.closed).toBe(false)
    expect(one.sent).toEqual([session('BBBB')])
    expect(two.sent).toEqual([session('BBBB')])

    // And what they say next reaches the new TV without reconnecting anything.
    second.clear()
    relay.routeFromPlayer('p1', { type: 'join', playerId: 'p1', name: 'Wilf' })
    expect(second.sent).toEqual([{ type: 'join', playerId: 'p1', name: 'Wilf' }])
  })

  it('tells the TV it replaced why it was hung up on', () => {
    relay.attachHost(host)
    relay.attachHost(fakeConnection())

    expect(host.closedWith).toEqual({ code: CLOSE_REPLACED, reason: 'replaced' })
  })

  it('ignores a stale host socket closing after it was replaced', () => {
    relay.attachHost(host)
    relay.attachHost(fakeConnection())

    relay.detachHost(host)

    expect(relay.hasHost).toBe(true)
    expect(relay.session).toBe('BBBB')
  })
})
