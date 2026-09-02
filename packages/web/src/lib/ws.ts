import type { z } from 'zod'

/**
 * The WebSocket client both pages use. It knows nothing about the game: it
 * connects, parses inbound messages with a shared schema, drops anything that
 * does not parse, and reconnects with a backoff.
 */

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

/** Close codes in this range mean "do not come back": the server said no. */
const FATAL_CLOSE_MIN = 4000
const FATAL_CLOSE_MAX = 4099

const FIRST_RETRY_MS = 500
const MAX_RETRY_MS = 8_000

export interface WsClientOptions<Schema extends z.ZodType> {
  /** Query parameters for `/ws`, such as role, room and playerId. */
  query: Record<string, string>
  schema: Schema
  onMessage: (message: z.infer<Schema>) => void
  onStatus?: (status: ConnectionStatus) => void
  /**
   * The server hung up for good and there will be no reconnect. `reason` is
   * whatever it put in the close frame, such as `no-host` or `replaced`.
   */
  onFatal?: (info: { code: number; reason: string }) => void
}

export interface WsClient {
  send(message: unknown): void
  close(): void
}

export function wsUrl(query: Record<string, string>): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams(query)
  return `${protocol}//${window.location.host}/ws?${params.toString()}`
}

export function connect<Schema extends z.ZodType>(options: WsClientOptions<Schema>): WsClient {
  let socket: WebSocket | null = null
  let retryMs = FIRST_RETRY_MS
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let closedByUs = false

  const setStatus = (status: ConnectionStatus) => options.onStatus?.(status)

  function open(): void {
    setStatus('connecting')
    const ws = new WebSocket(wsUrl(options.query))
    socket = ws

    ws.addEventListener('open', () => {
      retryMs = FIRST_RETRY_MS
      setStatus('open')
    })

    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      let json: unknown
      try {
        json = JSON.parse(event.data)
      } catch {
        return
      }
      const parsed = options.schema.safeParse(json)
      if (!parsed.success) return
      options.onMessage(parsed.data)
    })

    ws.addEventListener('close', (event) => {
      socket = null
      setStatus('closed')
      if (closedByUs) return
      if (event.code >= FATAL_CLOSE_MIN && event.code <= FATAL_CLOSE_MAX) {
        options.onFatal?.({ code: event.code, reason: event.reason })
        return
      }
      retryTimer = setTimeout(open, retryMs)
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
    })

    // 'close' always follows 'error', so the reconnect is handled above.
    ws.addEventListener('error', () => {})
  }

  open()

  return {
    send(message) {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    },
    close() {
      closedByUs = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      socket?.close()
    },
  }
}
