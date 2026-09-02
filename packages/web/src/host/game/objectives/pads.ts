import { ZONE_COLOURS } from '../constants.js'
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

/**
 * A handful of pads, placed clear of each other and wholly inside the world.
 * `capacity` is how many blobs one pad is meant to hold, and `roominess` how
 * much elbow room they get doing it — under 1 they have to shove.
 */
export function makePads(
  context: GenerateContext,
  count: number,
  capacity: number,
  roominess: number,
): CircleZone[] {
  const { rng } = context
  const cell = cellsAcross(context.world, count)
  // A little jiggle either way, so two goes at the same level are not twins —
  // but never bigger than its own square of floor, because pads that overlap
  // make "which pad are you on?" unanswerable, and that is the whole game.
  const wanted = radiusFor(capacity, roominess * range(rng, 0.94, 1.06))
  const radius = Math.min(wanted, (Math.min(cell.width, cell.height) / 2) * FILL)

  const squares = shuffled(rng, count)
  return squares.map((square, index) => {
    const spot = somewhereIn(rng, context.world, cell, square, radius)
    return {
      id: `${context.id}-pad-${index}`,
      shape: 'circle',
      x: spot.x,
      y: spot.y,
      radius,
      colour: colourOfPad(index),
    }
  })
}

export function colourOfPad(index: number): string {
  // The list is a literal and the index is wrapped, so there is always one.
  return (ZONE_COLOURS[index % ZONE_COLOURS.length] as { hex: string }).hex
}

/**
 * What to call a pad when a phone is being told which one is theirs. Colours
 * off the palette always have a name; anything else is described rather than
 * named, which is better than a hex code arriving on a six-year-old's phone.
 */
export function nameOfColour(hex: string): string {
  return ZONE_COLOURS.find((colour) => colour.hex === hex)?.name ?? 'shiny'
}

/** How much of its square of floor a pad may fill, leaving a lane between them. */
const FILL = 0.8

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
