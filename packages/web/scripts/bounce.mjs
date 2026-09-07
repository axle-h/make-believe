import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

/**
 * Turns four approved landing sounds into the ten a room of blobs needs.
 *
 * Run by hand — `node packages/web/scripts/bounce.mjs` — whenever the voices
 * change; the `.ogg`s it writes are committed, exactly as the PWA icons are.
 * It needs `ffmpeg` on the path and the Puyo rip beside this repo; neither is
 * a dependency of the app, and nothing in `pnpm build` runs this.
 *
 * ## Why it is generated rather than picked
 *
 * The first ten were ten different sound effects, and listening to them
 * settled it: the three `lock` sounds — a piece landing — were the only ones
 * that read as a blob hitting something, plus `genesis/settle`. `move`,
 * `rotate` and `hard-drop` are menu noises with no weight to them.
 *
 * So every voice is one of those four, and what makes ten of them is
 * **pitch**. That is the right axis anyway: a room tells its blobs apart by
 * how high or low each one lands, which is what "one voice each out of ten"
 * asked for, and it means no voice can turn out to be the wrong *kind* of
 * sound. Resampling shifts speed along with pitch, which for a short
 * percussive one-shot is exactly right — a higher blob lands quicker.
 *
 * ## And why they are all levelled
 *
 * The originals ran from −4.8 dB to −28.7 dB peak. Twenty-four decibels
 * across a room means the quiet blobs are simply not heard beside the loud
 * ones — which is what "6 is too quiet" was. Every voice is now peak
 * normalised to the same level, so a blob's landing is as loud as anybody
 * else's and only its pitch tells it apart.
 */

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../src/player/bounce')

/**
 * The Puyo Puyo Tetris 2 rip these are cut from, beside this repo. See the
 * README next to the output for what it is and why it is allowed to be here.
 */
const source = resolve(here, '../../../../dr-rustario-vs-rustris/puyo-rusto/src/theme')

/** Everything is 44.1 kHz, and the resample has to land back on it. */
const RATE = 44_100

/**
 * What every voice is normalised to. It is about where the loudest of the
 * approved four already sat, so nothing had to be pushed hard to reach it.
 */
const PEAK_DB = -6

/**
 * The ten, in slot order. `pitch` is a resampling ratio: 1 is the sound
 * untouched, above is higher and shorter, below is lower and longer.
 *
 * The four at `pitch: 1` are the four that were listened to and approved, and
 * they are here exactly as they were bar the levelling. The rest are those
 * same four moved about a whole tone or two either way — far enough apart that
 * two blobs never sound like each other, near enough that all ten are plainly
 * the same *kind* of noise.
 */
const VOICES = [
  { from: 'sfx/lock', pitch: 1 }, // 0
  { from: 'genesis/lock', pitch: 1.22 }, // 1
  { from: 'snes/lock', pitch: 0.84 }, // 2
  { from: 'sfx/lock', pitch: 1.32 }, // 3
  { from: 'genesis/settle', pitch: 0.86 }, // 4
  { from: 'genesis/lock', pitch: 1 }, // 5
  { from: 'genesis/settle', pitch: 1 }, // 6
  { from: 'snes/lock', pitch: 1.26 }, // 7
  { from: 'snes/lock', pitch: 1 }, // 8
  { from: 'sfx/lock', pitch: 0.8 }, // 9
]

/** How loud the loudest sample in a file is, in dB below full scale. */
async function peakOf(file, filter) {
  const { stderr } = await run('ffmpeg', [
    '-hide_banner',
    '-i',
    file,
    '-af',
    `${filter},volumedetect`,
    '-f',
    'null',
    '/dev/null',
  ]).catch((error) => ({ stderr: error.stderr ?? '' }))
  const found = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr)
  if (!found) throw new Error(`could not read the level of ${file}`)
  return Number(found[1])
}

/** One voice: shifted, levelled, encoded — and a line to say what it became. */
async function build(slot, voice) {
  const file = resolve(source, `${voice.from}.ogg`)
  // Resampling is the whole of the pitch shift: play the same samples faster
  // and they come out higher, then tell the encoder they are 44.1 kHz again.
  const shift =
    voice.pitch === 1 ? 'anull' : `asetrate=${Math.round(RATE * voice.pitch)},aresample=${RATE}`

  // Two passes, because a peak is not knowable until the shift has happened.
  const peak = await peakOf(file, shift)
  const gain = (PEAK_DB - peak).toFixed(2)

  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    file,
    '-af',
    `${shift},volume=${gain}dB`,
    '-c:a',
    'libvorbis',
    '-q:a',
    '5',
    resolve(out, `${slot}.ogg`),
  ])

  const said = voice.pitch === 1 ? 'as it is' : `\u00d7 ${voice.pitch}`
  return `${slot}.ogg  ${voice.from} ${said}  ${gain > 0 ? '+' : ''}${gain} dB`
}

// All ten at once — they are independent, and ffmpeg is the slow part.
const built = await Promise.all(VOICES.map((voice, slot) => build(slot, voice)))
for (const line of built) console.log(line)
