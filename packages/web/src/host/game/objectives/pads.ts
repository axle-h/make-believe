import { BLOB_COLOURS, ZONE_COLOURS } from '../constants.js'
import { intRange, range, type Rng } from '../rng.js'
import type { World } from '../state.js'
import { radiusFor, type CircleZone } from '../zones.js'
import type { GenerateContext } from './types.js'

/** Pad colours wrap beyond this, so a task that names pads by colour asks for no more. */
export const MAX_NAMED_PADS = ZONE_COLOURS.length

export interface PadOptions {
  colours?: readonly string[]
  /** The count may not be traded for room: pairs needs one pad per couple. The pads are squashed instead. */
  exactly?: boolean
  /** The fewest pads still worth having when some must be given up. */
  least?: number
}

/**
 * `capacity` blobs per pad, with `roominess` elbow room (under 1 they shove). Each pad stays in its
 * own square of floor, and when the capacity will not fit there it lays out fewer pads rather than
 * smaller ones, unless `exactly` asks for the count.
 */
export function makePads(
  context: GenerateContext,
  count: number,
  capacity: number,
  roominess: number,
  options: PadOptions = {},
): CircleZone[] {
  const { rng } = context
  const wanted = radiusFor(capacity, roominess * range(rng, 0.94, 1.06))
  const least = options.exactly === true ? count : Math.min(count, options.least ?? 1)
  const laid = fitting(context.world, count, wanted, least)
  const cell = cellsAcross(context.world, laid)
  const radius = Math.min(wanted, (Math.min(cell.width, cell.height) / 2) * FILL)

  const squares = shuffled(rng, laid)
  return squares.map((square, index) => {
    const spot = somewhereIn(rng, context.world, cell, square, radius)
    return {
      id: `${context.id}-pad-${index}`,
      shape: 'circle',
      x: spot.x,
      y: spot.y,
      radius,
      colour: options.colours?.[index] ?? colourOfPad(index),
    }
  })
}

export function colourOfPad(index: number): string {
  return (ZONE_COLOURS[index % ZONE_COLOURS.length] as { hex: string }).hex
}

/** A colour in neither palette is described, never sent to a phone as a hex code. */
export function nameOfColour(hex: string): string {
  return (
    ZONE_COLOURS.find((colour) => colour.hex === hex)?.name ??
    BLOB_COLOURS.find((colour) => colour.hex === hex)?.name ??
    'shiny'
  )
}

/** Share of its square a pad may fill, leaving a lane between pads. */
const FILL = 0.8

/** The most pads, up to `count` and never below `least`, whose squares fit a pad of the size wanted. */
function fitting(world: World, count: number, wanted: number, least: number): number {
  for (let laid = count; laid > least; laid--) {
    const cell = cellsAcross(world, laid)
    if ((Math.min(cell.width, cell.height) / 2) * FILL >= wanted) return laid
  }
  return Math.max(1, least)
}

interface Grid {
  columns: number
  rows: number
  width: number
  height: number
}

/** One square per pad, wide before tall; a pad never leaves its square, so pads never overlap. */
function cellsAcross(world: World, count: number): Grid {
  const columns = count <= 3 ? Math.max(1, count) : Math.ceil(count / 2)
  const rows = Math.ceil(count / columns)
  return { columns, rows, width: world.width / columns, height: world.height / rows }
}

function somewhereIn(
  rng: Rng,
  world: World,
  cell: Grid,
  square: number,
  radius: number,
): { x: number; y: number } {
  const column = square % cell.columns
  const row = Math.floor(square / cell.columns)
  const slackX = Math.max(0, cell.width / 2 - radius)
  const slackY = Math.max(0, cell.height / 2 - radius)
  const x = cell.width * (column + 0.5) + range(rng, -slackX, slackX)
  const y = cell.height * (row + 0.5) + range(rng, -slackY, slackY)
  return {
    x: Math.min(world.width - radius, Math.max(radius, x)),
    y: Math.min(world.height - radius, Math.max(radius, y)),
  }
}

/** Shuffled so the colours are not always left to right. */
function shuffled(rng: Rng, count: number): number[] {
  const squares = Array.from({ length: count }, (_, index) => index)
  for (let index = squares.length - 1; index > 0; index--) {
    const swap = intRange(rng, 0, index)
    const held = squares[index] as number
    squares[index] = squares[swap] as number
    squares[swap] = held
  }
  return squares
}
