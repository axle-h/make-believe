import { z } from 'zod'
import { MAX_NAME_LENGTH, isValidName } from './blobName.js'
import { isValidSessionCode } from './sessionCode.js'

/**
 * Every message on the wire, as zod schemas with the TypeScript types derived
 * from them. The server validates everything inbound and drops what does not
 * parse; the host and the players trust nothing that has not been through here.
 */

/** Longest speech-bubble text a player may send. */
export const MAX_TEXT_LENGTH = 60
/** Longest objective headline the TV may put on a phone's strip. */
export const MAX_HEADLINE_LENGTH = 80
/** Longest second line under a headline. */
export const MAX_DETAIL_LENGTH = 120
/**
 * Longest `data:` URL accepted for a drawing. A 256x256 doodle is far below
 * 256 KiB; a photo-sized paste is not, and the server drops it.
 */
export const MAX_PNG_LENGTH = 262_144

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

export const PlayerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'playerId must be url-safe')

/** `'*'` fans a host message out to every player. */
export const RecipientSchema = z.union([z.literal('*'), PlayerIdSchema])

// --- player → host -------------------------------------------------------

export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  playerId: PlayerIdSchema,
  name: z.string().max(MAX_NAME_LENGTH).refine(isValidName, 'name must not be blank'),
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

/**
 * "I am done — forget me." The one thing a phone can ask the world to undo:
 * the blob goes, and its name, its picture and its place on the floor go with
 * it. Nothing is sent back, because the phone is not waiting for an answer —
 * it has already forgotten everything too and is asking for a name again.
 *
 * This is not `left`. A phone that has merely gone quiet leaves its blob
 * standing there waiting for it; a phone that has finished does not.
 */
export const FinishMessageSchema = z.object({
  type: z.literal('finish'),
  playerId: PlayerIdSchema,
})

export const PlayerToHostMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
  FinishMessageSchema,
])

// --- host → player -------------------------------------------------------

export const AssignedMessageSchema = z.object({
  type: z.literal('assigned'),
  colour: z.string().min(1).max(32),
  slot: z.number().int().nonnegative(),
  /**
   * Whether the world already has this blob's drawing. The phone keeps the
   * last one it sent, so a `false` here — a TV that has reloaded, or a world
   * that has forgotten a blob — is its cue to send it up again. The host is
   * still the one that knows; the phone only answers.
   */
  hasDrawing: z.boolean(),
})

/**
 * What the world is asking for, echoed onto the phone under the blob's name.
 *
 * It is information and never an instruction: no screen changes on it, nothing
 * is disabled by it, and every tool the phone has stays exactly where it was.
 * A child who ignores it entirely is still playing. An empty `headline` takes
 * the strip down again.
 */
export const BriefMessageSchema = z.object({
  type: z.literal('brief'),
  headline: z.string().max(MAX_HEADLINE_LENGTH),
  /** The quieter second line: a count, a hint, or the half only you are told. */
  detail: z.string().max(MAX_DETAIL_LENGTH).optional(),
  /** Tints the strip when the task is about a particular colour. */
  colour: z.string().min(1).max(32).optional(),
  tone: z.enum(['task', 'win', 'miss']),
})

/**
 * There is no TV for you: show the waiting screen and try again shortly. Sent
 * by the *relay*, never by the host, when no host has the world.
 */
export const WaitingMessageSchema = z.object({
  type: z.literal('waiting'),
})

/**
 * Which world you have just connected to. The relay sends this to every client
 * the moment it attaches, and again to everybody when a TV takes the world
 * over — it is the whole of how a session code is negotiated, and the reason
 * no code appears in any URL.
 *
 * A client holding a different code was talking to a world that is gone. It
 * keeps its name and its picture and comes back as a new player.
 */
export const SessionMessageSchema = z.object({
  type: z.literal('session'),
  session: z.string().refine(isValidSessionCode, 'not a session code'),
})

export const HostToPlayerMessageSchema = z.discriminatedUnion('type', [
  AssignedMessageSchema,
  BriefMessageSchema,
  WaitingMessageSchema,
  SessionMessageSchema,
])

/**
 * What the host actually puts on the wire: a message for a phone plus a `to`.
 * Which blob you are, and what the world is currently asking for — the second
 * is still not a round, and still nothing a phone has to obey.
 *
 * The relay forwards by `to` and never looks at the rest, so adding to this
 * union costs it nothing.
 */
export const HostOutboundMessageSchema = z.discriminatedUnion('type', [
  AssignedMessageSchema.extend({ to: RecipientSchema }),
  BriefMessageSchema.extend({ to: RecipientSchema }),
])

// --- server → host -------------------------------------------------------

export const LeftMessageSchema = z.object({
  type: z.literal('left'),
  playerId: PlayerIdSchema,
})

/** Everything the *game model* is fed: forwarded player messages plus `left`. */
export const ServerToHostMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
  FinishMessageSchema,
  LeftMessageSchema,
])

/**
 * Everything the host *socket* can receive. `session` is kept out of the union
 * above on purpose: it is about the connection rather than the world, and the
 * game model must never have a case for it.
 */
export const HostInboundMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
  FinishMessageSchema,
  LeftMessageSchema,
  SessionMessageSchema,
])

// --- types ---------------------------------------------------------------

export type Recipient = z.infer<typeof RecipientSchema>
export type JoinMessage = z.infer<typeof JoinMessageSchema>
export type InputMessage = z.infer<typeof InputMessageSchema>
export type DrawingMessage = z.infer<typeof DrawingMessageSchema>
export type TextMessage = z.infer<typeof TextMessageSchema>
export type FinishMessage = z.infer<typeof FinishMessageSchema>
export type PlayerToHostMessage = z.infer<typeof PlayerToHostMessageSchema>
export type AssignedMessage = z.infer<typeof AssignedMessageSchema>
export type BriefMessage = z.infer<typeof BriefMessageSchema>
export type BriefTone = BriefMessage['tone']
export type WaitingMessage = z.infer<typeof WaitingMessageSchema>
export type SessionMessage = z.infer<typeof SessionMessageSchema>
export type HostToPlayerMessage = z.infer<typeof HostToPlayerMessageSchema>
export type HostOutboundMessage = z.infer<typeof HostOutboundMessageSchema>
export type LeftMessage = z.infer<typeof LeftMessageSchema>
export type ServerToHostMessage = z.infer<typeof ServerToHostMessageSchema>
export type HostInboundMessage = z.infer<typeof HostInboundMessageSchema>

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
