import { z } from 'zod'

/**
 * Every message on the wire, as zod schemas with the TypeScript types derived
 * from them. The server validates everything inbound and drops what does not
 * parse; the host and the players trust nothing that has not been through here.
 */

/** Longest blob name a player may pick. */
export const MAX_NAME_LENGTH = 16
/** Longest speech-bubble text a player may send. */
export const MAX_TEXT_LENGTH = 60
/** Longest `data:` URL accepted for a drawing (see docs/DECISIONS.md, D-003). */
export const MAX_PNG_LENGTH = 262_144

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

export const PlayerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'playerId must be url-safe')

export const PhaseValueSchema = z.enum(['lobby', 'play', 'draw', 'text'])

/** `'*'` fans a host message out to every player. */
export const RecipientSchema = z.union([z.literal('*'), PlayerIdSchema])

// --- player → host -------------------------------------------------------

export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  playerId: PlayerIdSchema,
  name: z.string().min(1).max(MAX_NAME_LENGTH),
})

const AxisSchema = z.number().finite().min(-1).max(1)

export const InputMessageSchema = z.object({
  type: z.literal('input'),
  playerId: PlayerIdSchema,
  dx: AxisSchema,
  dy: AxisSchema,
})

export const DrawingMessageSchema = z.object({
  type: z.literal('drawing'),
  playerId: PlayerIdSchema,
  png: z
    .string()
    .max(MAX_PNG_LENGTH)
    .startsWith(PNG_DATA_URL_PREFIX, 'png must be a data:image/png;base64 url'),
})

export const TextMessageSchema = z.object({
  type: z.literal('text'),
  playerId: PlayerIdSchema,
  value: z.string().max(MAX_TEXT_LENGTH),
})

export const PlayerToHostMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
])

// --- host → player -------------------------------------------------------

export const AssignedMessageSchema = z.object({
  type: z.literal('assigned'),
  colour: z.string().min(1).max(32),
  slot: z.number().int().nonnegative(),
})

export const PhaseMessageSchema = z.object({
  type: z.literal('phase'),
  value: PhaseValueSchema,
})

export const HostToPlayerMessageSchema = z.discriminatedUnion('type', [
  AssignedMessageSchema,
  PhaseMessageSchema,
])

/** What the host actually puts on the wire: a player message plus a `to`. */
export const HostOutboundMessageSchema = z.discriminatedUnion('type', [
  AssignedMessageSchema.extend({ to: RecipientSchema }),
  PhaseMessageSchema.extend({ to: RecipientSchema }),
])

// --- server → host -------------------------------------------------------

export const LeftMessageSchema = z.object({
  type: z.literal('left'),
  playerId: PlayerIdSchema,
})

/** Everything the host can receive: forwarded player messages plus `left`. */
export const ServerToHostMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
  LeftMessageSchema,
])

// --- types ---------------------------------------------------------------

export type PhaseValue = z.infer<typeof PhaseValueSchema>
export type Recipient = z.infer<typeof RecipientSchema>
export type JoinMessage = z.infer<typeof JoinMessageSchema>
export type InputMessage = z.infer<typeof InputMessageSchema>
export type DrawingMessage = z.infer<typeof DrawingMessageSchema>
export type TextMessage = z.infer<typeof TextMessageSchema>
export type PlayerToHostMessage = z.infer<typeof PlayerToHostMessageSchema>
export type AssignedMessage = z.infer<typeof AssignedMessageSchema>
export type PhaseMessage = z.infer<typeof PhaseMessageSchema>
export type HostToPlayerMessage = z.infer<typeof HostToPlayerMessageSchema>
export type HostOutboundMessage = z.infer<typeof HostOutboundMessageSchema>
export type LeftMessage = z.infer<typeof LeftMessageSchema>
export type ServerToHostMessage = z.infer<typeof ServerToHostMessageSchema>

/** Parse a raw wire string, returning `null` for anything that is not valid. */
export function parseMessage<T extends z.ZodTypeAny>(schema: T, raw: string): z.infer<T> | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const result = schema.safeParse(json)
  return result.success ? result.data : null
}
