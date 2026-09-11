// The colours a child can paint with. The TV may only ask a room for a colour a phone can make.

export interface Paint {
  name: string
  hex: string
}

/** Dark first, the order they sit in on the phone. */
export const PAINTS = [
  { name: 'black', hex: '#10121a' },
  { name: 'white', hex: '#f4f1ea' },
  { name: 'red', hex: '#ff5d5d' },
  { name: 'blue', hex: '#4ea8ff' },
  { name: 'green', hex: '#5ddf7f' },
  { name: 'yellow', hex: '#ffd23f' },
  { name: 'purple', hex: '#c07bff' },
] as const satisfies readonly Paint[]

export const PAINT_HEXES: readonly string[] = PAINTS.map((paint) => paint.hex)
