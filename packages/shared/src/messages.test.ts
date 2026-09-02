import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH } from './blobName.js'
import {
  AssignedMessageSchema,
  DrawingMessageSchema,
  HostOutboundMessageSchema,
  HostToPlayerMessageSchema,
  InputMessageSchema,
  JoinMessageSchema,
  LeftMessageSchema,
  MAX_PNG_LENGTH,
  MAX_TEXT_LENGTH,
  PlayerToHostMessageSchema,
  ServerToHostMessageSchema,
  TextMessageSchema,
  WaitingMessageSchema,
  parseMessage,
} from './messages.js'

const png = (length: number) => `data:image/png;base64,${'A'.repeat(length)}`

describe('join', () => {
  it('accepts a valid message', () => {
    expect(JoinMessageSchema.parse({ type: 'join', playerId: 'abc-123', name: 'Wilf' })).toEqual({
      type: 'join',
      playerId: 'abc-123',
      name: 'Wilf',
    })
  })

  it('rejects a malformed message', () => {
    expect(JoinMessageSchema.safeParse({ type: 'join', playerId: 'abc' }).success).toBe(false)
    expect(JoinMessageSchema.safeParse({ type: 'join', playerId: 'a b', name: 'x' }).success).toBe(
      false,
    )
    expect(JoinMessageSchema.safeParse({ type: 'join', playerId: 'abc', name: '' }).success).toBe(
      false,
    )
  })

  it('rejects an oversize name', () => {
    const name = 'x'.repeat(MAX_NAME_LENGTH + 1)
    expect(JoinMessageSchema.safeParse({ type: 'join', playerId: 'abc', name }).success).toBe(false)
  })

  it('rejects a name that is only whitespace', () => {
    expect(JoinMessageSchema.safeParse({ type: 'join', playerId: 'abc', name: '   ' }).success).toBe(
      false,
    )
  })
})

describe('input', () => {
  it('accepts a normalised vector', () => {
    expect(InputMessageSchema.parse({ type: 'input', playerId: 'p1', dx: -1, dy: 0.5 })).toEqual({
      type: 'input',
      playerId: 'p1',
      dx: -1,
      dy: 0.5,
    })
  })

  it('rejects a malformed message', () => {
    expect(InputMessageSchema.safeParse({ type: 'input', playerId: 'p1', dx: '0' }).success).toBe(
      false,
    )
  })

  it('rejects axes outside -1..1', () => {
    expect(InputMessageSchema.safeParse({ type: 'input', playerId: 'p1', dx: 1.5, dy: 0 }).success).toBe(
      false,
    )
    expect(InputMessageSchema.safeParse({ type: 'input', playerId: 'p1', dx: 0, dy: -2 }).success).toBe(
      false,
    )
    expect(
      InputMessageSchema.safeParse({ type: 'input', playerId: 'p1', dx: Number.NaN, dy: 0 }).success,
    ).toBe(false)
  })
})

describe('drawing', () => {
  it('accepts a png data url', () => {
    expect(DrawingMessageSchema.safeParse({ type: 'drawing', playerId: 'p1', png: png(16) }).success).toBe(
      true,
    )
  })

  it('rejects a non-png payload', () => {
    expect(
      DrawingMessageSchema.safeParse({ type: 'drawing', playerId: 'p1', png: 'https://example.com/a.png' })
        .success,
    ).toBe(false)
  })

  it('rejects an oversize png', () => {
    expect(
      DrawingMessageSchema.safeParse({ type: 'drawing', playerId: 'p1', png: png(MAX_PNG_LENGTH) }).success,
    ).toBe(false)
  })
})

describe('text', () => {
  it('accepts text up to the cap', () => {
    const value = 'x'.repeat(MAX_TEXT_LENGTH)
    expect(TextMessageSchema.safeParse({ type: 'text', playerId: 'p1', value }).success).toBe(true)
  })

  it('rejects a malformed message', () => {
    expect(TextMessageSchema.safeParse({ type: 'text', playerId: 'p1' }).success).toBe(false)
  })

  it('rejects oversize text', () => {
    const value = 'x'.repeat(MAX_TEXT_LENGTH + 1)
    expect(TextMessageSchema.safeParse({ type: 'text', playerId: 'p1', value }).success).toBe(false)
  })
})

describe('assigned and waiting', () => {
  it('accepts valid host messages', () => {
    expect(
      AssignedMessageSchema.safeParse({
        type: 'assigned',
        colour: '#ff0000',
        slot: 0,
        hasDrawing: false,
      }).success,
    ).toBe(true)
    expect(WaitingMessageSchema.safeParse({ type: 'waiting' }).success).toBe(true)
  })

  it('rejects malformed host messages', () => {
    expect(
      AssignedMessageSchema.safeParse({ type: 'assigned', colour: '#f00', slot: -1, hasDrawing: false })
        .success,
    ).toBe(false)
    expect(
      AssignedMessageSchema.safeParse({ type: 'assigned', colour: '', slot: 0, hasDrawing: false }).success,
    ).toBe(false)
    expect(WaitingMessageSchema.safeParse({ type: 'nearly-waiting' }).success).toBe(false)
  })

  it('makes the host say whether it has the drawing, rather than guessing', () => {
    // A phone that cannot tell would either lose its picture or resend it on
    // every hello, so the answer is required and must be a boolean.
    expect(AssignedMessageSchema.safeParse({ type: 'assigned', colour: '#f00', slot: 0 }).success).toBe(
      false,
    )
    expect(
      AssignedMessageSchema.safeParse({ type: 'assigned', colour: '#f00', slot: 0, hasDrawing: 'yes' })
        .success,
    ).toBe(false)
  })
})

describe('left', () => {
  it('accepts a valid message', () => {
    expect(LeftMessageSchema.safeParse({ type: 'left', playerId: 'p1' }).success).toBe(true)
  })

  it('rejects a malformed message', () => {
    expect(LeftMessageSchema.safeParse({ type: 'left' }).success).toBe(false)
  })
})

describe('unions', () => {
  it('accepts each player message and rejects unknown types', () => {
    expect(PlayerToHostMessageSchema.safeParse({ type: 'join', playerId: 'p1', name: 'a' }).success).toBe(
      true,
    )
    expect(PlayerToHostMessageSchema.safeParse({ type: 'waiting' }).success).toBe(false)
    expect(PlayerToHostMessageSchema.safeParse({ type: 'nope', playerId: 'p1' }).success).toBe(false)
  })

  it('accepts host messages to a player and to everyone', () => {
    expect(
      HostOutboundMessageSchema.safeParse({
        type: 'assigned',
        colour: '#0f0',
        slot: 1,
        hasDrawing: false,
        to: '*',
      }).success,
    ).toBe(true)
    expect(
      HostOutboundMessageSchema.safeParse({
        type: 'assigned',
        colour: '#0f0',
        slot: 1,
        hasDrawing: true,
        to: 'p2',
      }).success,
    ).toBe(true)
  })

  it('rejects a host message without a recipient', () => {
    expect(
      HostOutboundMessageSchema.safeParse({ type: 'assigned', colour: '#0f0', slot: 1, hasDrawing: false })
        .success,
    ).toBe(false)
  })

  it('will not let the host send a phone off to wait — only the relay does that', () => {
    expect(HostOutboundMessageSchema.safeParse({ type: 'waiting', to: '*' }).success).toBe(false)
  })

  it('lets the player parse what the host sends it', () => {
    expect(HostToPlayerMessageSchema.safeParse({ type: 'waiting' }).success).toBe(true)
    expect(HostToPlayerMessageSchema.safeParse({ type: 'left', playerId: 'p1' }).success).toBe(false)
  })

  it('lets the host parse forwarded player messages and left', () => {
    expect(ServerToHostMessageSchema.safeParse({ type: 'left', playerId: 'p1' }).success).toBe(true)
    expect(
      ServerToHostMessageSchema.safeParse({ type: 'input', playerId: 'p1', dx: 0, dy: 0 }).success,
    ).toBe(true)
    expect(
      ServerToHostMessageSchema.safeParse({ type: 'assigned', colour: 'red', slot: 0, hasDrawing: false })
        .success,
    ).toBe(false)
  })
})

describe('parseMessage', () => {
  it('parses a valid wire string', () => {
    const raw = JSON.stringify({ type: 'input', playerId: 'p1', dx: 0, dy: 1 })
    expect(parseMessage(PlayerToHostMessageSchema, raw)).toEqual({
      type: 'input',
      playerId: 'p1',
      dx: 0,
      dy: 1,
    })
  })

  it('returns null for invalid json and for invalid messages', () => {
    expect(parseMessage(PlayerToHostMessageSchema, 'not json')).toBeNull()
    expect(parseMessage(PlayerToHostMessageSchema, '{"type":"input"}')).toBeNull()
  })
})
