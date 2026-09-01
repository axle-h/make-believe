import { afterEach, beforeEach, expect, it } from 'vitest'
import WebSocket from 'ws'
import { startServer, type StartedServer } from './server.js'

let app: StartedServer

beforeEach(async () => {
  app = await startServer(0)
})

afterEach(async () => {
  await app.close()
})

interface Client {
  ws: WebSocket
  /** Next message, from a queue, so nothing is missed between awaits. */
  next(): Promise<unknown>
  closed: Promise<void>
  send(message: unknown): void
}

function connect(query: string): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws?${query}`)
  const queue: unknown[] = []
  let waiting: ((message: unknown) => void) | null = null

  ws.on('message', (data) => {
    const message: unknown = JSON.parse(data.toString())
    if (waiting) {
      const resolveWaiting = waiting
      waiting = null
      resolveWaiting(message)
    } else {
      queue.push(message)
    }
  })

  const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()))

  const client: Client = {
    ws,
    closed,
    next: () =>
      new Promise((resolve) => {
        const queued = queue.shift()
        if (queued !== undefined) resolve(queued)
        else waiting = resolve
      }),
    send: (message) => ws.send(JSON.stringify(message)),
  }

  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(client))
    ws.once('error', reject)
  })
}

it('serves healthz and relays between a host and two players', async () => {
  const health = await fetch(`http://127.0.0.1:${app.port}/healthz`)
  expect(health.status).toBe(200)
  expect(await health.text()).toBe('ok')

  const host = await connect('role=host&room=ABCD')
  const one = await connect('role=player&room=ABCD&playerId=p1')
  const two = await connect('role=player&room=ABCD&playerId=p2')

  // player → host, tagged with the playerId the socket connected with
  one.send({ type: 'join', playerId: 'p1', name: 'Wilf' })
  expect(await host.next()).toEqual({ type: 'join', playerId: 'p1', name: 'Wilf' })

  // host → one player, with `to` stripped off
  host.send({ type: 'assigned', colour: '#ff0000', slot: 0, to: 'p1' })
  expect(await one.next()).toEqual({ type: 'assigned', colour: '#ff0000', slot: 0 })

  // host → everyone
  host.send({ type: 'phase', value: 'play', to: '*' })
  expect(await one.next()).toEqual({ type: 'phase', value: 'play' })
  expect(await two.next()).toEqual({ type: 'phase', value: 'play' })

  // rubbish is dropped, and the socket carries on working
  one.send({ type: 'input', playerId: 'p1', dx: 99, dy: 0 })
  one.ws.send('not json at all')
  one.send({ type: 'input', playerId: 'p1', dx: 1, dy: 0 })
  expect(await host.next()).toEqual({ type: 'input', playerId: 'p1', dx: 1, dy: 0 })

  // a player leaving is announced to the host
  two.ws.close()
  expect(await host.next()).toEqual({ type: 'left', playerId: 'p2' })

  host.ws.close()
  one.ws.close()
})

it('sends a player with the wrong room code back to the lobby and hangs up', async () => {
  const host = await connect('role=host&room=ABCD')
  const stale = await connect('role=player&room=WXYZ&playerId=p1')

  expect(await stale.next()).toEqual({ type: 'phase', value: 'lobby' })
  await stale.closed

  host.ws.close()
})

it('hangs up on a bad room code, a bad role and a bad playerId', async () => {
  await Promise.all(
    ['role=host&room=nope', 'role=nonsense&room=ABCD', 'role=player&room=ABCD&playerId=a%20b'].map(
      async (query) => {
        const client = await connect(query)
        await client.closed
      },
    ),
  )
})
