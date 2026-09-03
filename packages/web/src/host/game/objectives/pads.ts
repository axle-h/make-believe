import { BLOB_COLOURS, ZONE_COLOURS } from '../constants.js'
import { intRange, range, type Rng } from '../rng.js'
import type { World } from '../state.js'
import { radiusFor, type CircleZone } from '../zones.js'
import type { GenerateContext } from './types.js'

/**
 * Pads: several spots on the floor at once, rather than the single spot
 * everybody piles onto. Three tasks are built out of them — pairing up,
 * finding the one that is yours, and following a chain of lights — and they
 * all want the same thing: a handful of circles, well apart, each a colour
 * that can be said out loud.
 *
 * There are only as many pad colours as there are names worth saying, so a
 * room with more pads than that wraps round. Only the task that identifies a
 * pad *by* its colour has to care, and that one asks for no more pads than
 * there are colours.
 */

/** How many pads can be told apart by colour alone. */
export const MAX_NAMED_PADS = ZONE_COLOURS.length

export interface PadOptions {
  /**
   * Colours for the pads, in order, for a task that identifies a pad by
   * something other than the floor palette.
   */
  colours?: readonly string[]
  /**
   * This many pads or nothing: the count means something to the task and may
   * not be traded away for room. Pairs lays out one pad per couple, so a pad
   * fewer is a sum the room cannot make come out.
   */
  exactly?: boolean
  /**
   * The fewest that are still worth having, for a task that can give some of
   * its pads up but not all of them: a chain of lights with one pad has
   * nowhere to send anybody.
   */
  least?: number
}

/**
 * A handful of pads, placed clear of each other and wholly inside the world.
 * `capacity` is how many blobs one pad is meant to hold, and `roominess` how
 * much elbow room they get doing it — under 1 they have to shove.
 *
 * **The capacity comes first.** Every pad has to stay inside its own square of
 * floor, or two of them overlap and "which pad are you on?" stops having an
 * answer — so when the room a capacity asks for will not fit that square, this
 * lays out *fewer* pads rather than shrinking them. A pad nobody can all stand
 * on is worse than a pad fewer: six blobs told to gather on a pad they cannot
 * all fit inside is not a hard task, it is an impossible one, and that is how
 * following the lights came back from the second play test.
 */
export function makePads(
  context: GenerateContext,
  count: number,
  capacity: number,
  roominess: number,
  options: PadOptions = {},
): CircleZone[] {
  const { rng } = context
  // A little jiggle either way, so two goes at the same level are not twins.
  const wanted = radiusFor(capacity, roominess * range(rng, 0.94, 1.06))
  const least = options.exactly === true ? count : Math.min(count, options.least ?? 1)
  const laid = fitting(context.world, count, wanted, least)
  const cell = cellsAcross(context.world, laid)
  // A task that insists on its count takes the squash; nothing else has to.
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
      // A task that identifies a pad by something other than the pad palette —
      // find your own pad colours them like the blobs — says so; everything
      // else takes the floor colours, which are chosen not to be blobs.
      colour: options.colours?.[index] ?? colourOfPad(index),
    }
  })
}

export function colourOfPad(index: number): string {
  // The list is a literal and the index is wrapped, so there is always one.
  return (ZONE_COLOURS[index % ZONE_COLOURS.length] as { hex: string }).hex
}

/**
 * What to call a pad when a phone is being told which one is theirs. Both
 * palettes have a name for every colour in them — the floor's and the blobs' —
 * and anything else is described rather than named, which is better than a hex
 * code arriving on a six-year-old's phone.
 */
export function nameOfColour(hex: string): string {
  return (
    ZONE_COLOURS.find((colour) => colour.hex === hex)?.name ??
    BLOB_COLOURS.find((colour) => colour.hex === hex)?.name ??
    'shiny'
  )
}

/** How much of its square of floor a pad may fill, leaving a lane between them. */
const FILL = 0.8

/**
 * The most pads, up to the number asked for, whose own squares of floor are
 * big enough for a pad of the size wanted — and never fewer than `least`,
 * which is where a task says how much of its count it cannot do without.
 */
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

/**
 * The floor cut into one square per pad, wide before tall — the TV is wider
 * than it is high, and pads spread across it are easier to tell apart than
 * pads stacked up it. Every pad gets one square and stays inside it, which is
 * what makes them clear of each other without any luck involved.
 */
function cellsAcross(world: World, count: number): Grid {
  const columns = count <= 3 ? Math.max(1, count) : Math.ceil(count / 2)
  const rows = Math.ceil(count / columns)
  return { columns, rows, width: world.width / columns, height: world.height / rows }
}

/** Somewhere inside this pad's own square, wholly on the floor. */
function somewhereIn(
  rng: Rng,
  world: World,
  cell: Grid,
  square: number,
  radius: number,
): { x: number; y: number } {
  const column = square % cell.columns
  const row = Math.floor(square / cell.columns)
  // Whatever is left of the square once the pad is in it, to jiggle about in.
  const slackX = Math.max(0, cell.width / 2 - radius)
  const slackY = Math.max(0, cell.height / 2 - radius)
  const x = cell.width * (column + 0.5) + range(rng, -slackX, slackX)
  const y = cell.height * (row + 0.5) + range(rng, -slackY, slackY)
  return {
    x: Math.min(world.width - radius, Math.max(radius, x)),
    y: Math.min(world.height - radius, Math.max(radius, y)),
  }
}

/** The squares in a shuffled order, so the colours are not always left to right. */
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
