import { z } from 'zod'
import { MAX_NAME_LENGTH, isValidName } from './blobName.js'
import { isValidSessionCode } from './sessionCode.js'
import { SOUND_CUES } from './sounds.js'

// Every wire message, as zod schemas. The server drops whatever does not parse, and host and
// phones trust nothing that has not been through here. There are five unions and they are not
// interchangeable: a message left out of one is dropped in silence.

/** Longest speech-bubble text a player may send. */
export const MAX_TEXT_LENGTH = 60
export const MAX_HEADLINE_LENGTH = 80
export const MAX_DETAIL_LENGTH = 120
/** A 256x256 doodle is far below this; a photo-sized paste is not, and is dropped. */
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

export const ColourSchema = z.string().min(1).max(32)

/** The colour and the name are asked for, not handed out: one blob each, and the world grants or refuses. */
export const JoinMessageSchema = z.object({
  type: z.literal('join'),
  playerId: PlayerIdSchema,
  name: z.string().max(MAX_NAME_LENGTH).refine(isValidName, 'name must not be blank'),
  colour: ColourSchema,
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

// "Forget me": the blob is deleted outright, picture and all, and nothing is sent back.
// Not `left`, which leaves the blob standing there away, waiting for its phone.
export const FinishMessageSchema = z.object({
  type: z.literal('finish'),
  playerId: PlayerIdSchema,
})

// The grown-up's two buttons. The host grants the privilege and the phone never claims it: a
// command from any blob the host did not name is dropped. `kind` is a string because `shared`
// knows nothing of objectives; the host resolves it and ignores an unknown one.
export const CommandMessageSchema = z.discriminatedUnion('command', [
  z.object({
    type: z.literal('command'),
    playerId: PlayerIdSchema,
    command: z.literal('task'),
    kind: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal('command'),
    playerId: PlayerIdSchema,
    command: z.literal('restart'),
  }),
])

// What a phone may say; the server parses with it. The relay tags each with the id its socket
// arrived under, so the socket decides who is speaking, not the payload.
export const PlayerToHostMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
  FinishMessageSchema,
  CommandMessageSchema,
])

// --- host → player -------------------------------------------------------

export const AssignedMessageSchema = z.object({
  type: z.literal('assigned'),
  colour: z.string().min(1).max(32),
  slot: z.number().int().nonnegative(),
  /** `false` is the phone's cue to re-send the last drawing it kept. */
  hasDrawing: z.boolean(),
})

// Sent to one phone when its socket attaches and to '*' whenever the roster changes. `takenBy`
// is a name; an away blob keeps its colour, so only joining, quitting and being forgotten move it.
export const PaletteMessageSchema = z.object({
  type: z.literal('palette'),
  colours: z
    .array(
      z.object({
        hex: ColourSchema,
        name: z.string().min(1).max(32),
        takenBy: z.string().max(MAX_NAME_LENGTH).nullable(),
      }),
    )
    .max(64),
})

// Its own message because a palette to '*' can arrive while a join is in flight and must not
// read as a refusal. A refused phone goes back to the join screen.
export const RefusedMessageSchema = z.object({
  type: z.literal('refused'),
  reason: z.enum(['colour', 'name', 'full']),
})

/** Information exactly as a brief is: a phone with its sound off plays the same game. */
export const SoundMessageSchema = z.object({
  type: z.literal('sound'),
  cue: z.enum(SOUND_CUES),
})

// Only ever sent to the one blob the host decided was the grown-up's; no other phone has any
// trace of the sheet. `playable` is exactly what `askFor` accepts (a headcount, not `suits`),
// or the menu would lie.
export const GrownupMessageSchema = z.object({
  type: z.literal('grownup'),
  tasks: z
    .array(
      z.object({
        kind: z.string().min(1).max(64),
        title: z.string().min(1).max(64),
        playable: z.boolean(),
      }),
    )
    .max(64),
  level: z.number().int().positive(),
  maxLevel: z.number().int().positive(),
  score: z.number().int().nonnegative(),
})

// What the world is asking for: information, never an instruction, so it changes no screen and
// takes no tool away. An empty `headline` takes the strip down.
export const BriefMessageSchema = z.object({
  type: z.literal('brief'),
  headline: z.string().max(MAX_HEADLINE_LENGTH),
  detail: z.string().max(MAX_DETAIL_LENGTH).optional(),
  colour: z.string().min(1).max(32).optional(),
  /** A word of the headline to paint in `colour`; `splitHeadline` is how both ends cut it out. */
  emphasis: z.string().min(1).max(MAX_HEADLINE_LENGTH).optional(),
  /** `level` is the only line either screen draws bigger than the rest. */
  tone: z.enum(['task', 'win', 'miss', 'level']),
}).refine((brief) => brief.emphasis === undefined || brief.headline.includes(brief.emphasis), {
  error: 'emphasis must be a word of the headline',
  path: ['emphasis'],
})

/** No TV for you: wait and try again. Sent by the relay, never by the host. */
export const WaitingMessageSchema = z.object({
  type: z.literal('waiting'),
})

// Sent by the relay on attach, and to every phone when a TV takes the world over. A phone holding
// a different code mints a new playerId and reconnects, keeping its name and its picture.
export const SessionMessageSchema = z.object({
  type: z.literal('session'),
  session: z.string().refine(isValidSessionCode, 'not a session code'),
})

/** What a phone parses: the host's messages with `to` stripped off by the relay. */
export const HostToPlayerMessageSchema = z.discriminatedUnion('type', [
  AssignedMessageSchema,
  PaletteMessageSchema,
  RefusedMessageSchema,
  GrownupMessageSchema,
  SoundMessageSchema,
  BriefMessageSchema,
  WaitingMessageSchema,
  SessionMessageSchema,
])

// What the TV may say; the server parses with it. Every host → player message is written twice:
// in the union above, and here as `.extend({ to })`.
export const HostOutboundMessageSchema = z.discriminatedUnion('type', [
  AssignedMessageSchema.extend({ to: RecipientSchema }),
  PaletteMessageSchema.extend({ to: RecipientSchema }),
  RefusedMessageSchema.extend({ to: RecipientSchema }),
  GrownupMessageSchema.extend({ to: RecipientSchema }),
  SoundMessageSchema.extend({ to: RecipientSchema }),
  BriefMessageSchema.extend({ to: RecipientSchema }),
])

// --- server → host -------------------------------------------------------

export const LeftMessageSchema = z.object({
  type: z.literal('left'),
  playerId: PlayerIdSchema,
})

// A socket with nobody on it yet, so the TV can answer with the palette. Not the mirror of `left`:
// there is no blob for the game model to hear about.
export const ArrivedMessageSchema = z.object({
  type: z.literal('arrived'),
  playerId: PlayerIdSchema,
})

// The game model's input: `route()` in apply.ts switches exhaustively over it, so `session`,
// `arrived` and `command` are deliberately left out.
export const ServerToHostMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
  FinishMessageSchema,
  LeftMessageSchema,
])

/** Everything that can arrive at the TV socket; `main.ts` handles `command` as `debug.ts` does. */
export const HostInboundMessageSchema = z.discriminatedUnion('type', [
  JoinMessageSchema,
  InputMessageSchema,
  DrawingMessageSchema,
  TextMessageSchema,
  FinishMessageSchema,
  CommandMessageSchema,
  LeftMessageSchema,
  ArrivedMessageSchema,
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
export type PaletteMessage = z.infer<typeof PaletteMessageSchema>
export type PaletteEntry = PaletteMessage['colours'][number]
export type RefusedMessage = z.infer<typeof RefusedMessageSchema>
export type RefusedReason = RefusedMessage['reason']
export type ArrivedMessage = z.infer<typeof ArrivedMessageSchema>
export type GrownupMessage = z.infer<typeof GrownupMessageSchema>
export type SoundMessage = z.infer<typeof SoundMessageSchema>
export type CommandMessage = z.infer<typeof CommandMessageSchema>
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
