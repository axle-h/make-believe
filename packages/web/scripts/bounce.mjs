import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// Run by hand (`node packages/web/scripts/bounce.mjs`, needs ffmpeg) and its output committed:
// never edit the .oggs, change VOICES and rerun. A blob's voice is its `slot`, the index below.
// Every voice is peak-normalised to PEAK_DB, so only pitch tells them apart.
// Sources are a Puyo Puyo Tetris 2 sound rip in the dr-rustario-vs-rustris repo beside this one.

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../src/player/bounce')
const source = resolve(here, '../../../../dr-rustario-vs-rustris/puyo-rusto/src/theme')

const RATE = 44_100
const PEAK_DB = -6

/** In slot order. `pitch` is a resampling ratio, so higher is also shorter. */
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

async function build(slot, voice) {
  const file = resolve(source, `${voice.from}.ogg`)
  const shift =
    voice.pitch === 1 ? 'anull' : `asetrate=${Math.round(RATE * voice.pitch)},aresample=${RATE}`

  // The peak is measured after the shift, so this takes two passes.
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

const built = await Promise.all(VOICES.map((voice, slot) => build(slot, voice)))
for (const line of built) console.log(line)
