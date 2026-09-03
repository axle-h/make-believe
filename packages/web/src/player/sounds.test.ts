import { SOUND_CUES } from '@make-believe/shared'
import { describe, expect, it } from 'vitest'
import { voiceFor } from './sounds.js'

/**
 * The spec, which is pure. The `AudioContext` itself is not tested, for the
 * same reason Phaser is not: it needs a browser, and the shape of the noise is
 * the part worth being sure about.
 */
describe('the noises a phone makes', () => {
  it('has one for every cue the world can send', () => {
    for (const cue of SOUND_CUES) expect(voiceFor(cue)).toBeDefined()
  })

  it('keeps every one of them short, quiet and audible', () => {
    for (const cue of SOUND_CUES) {
      const voice = voiceFor(cue)
      expect(voice.ms).toBeGreaterThan(50)
      // Half a second is a long time in a game where six phones are beeping.
      expect(voice.ms).toBeLessThanOrEqual(500)
      expect(voice.gain).toBeGreaterThan(0)
      expect(voice.gain).toBeLessThanOrEqual(0.3)
      for (const hertz of [voice.from, voice.to, voice.second ?? 440]) {
        expect(hertz).toBeGreaterThan(60)
        expect(hertz).toBeLessThan(4_000)
      }
    }
  })

  /**
   * Told apart by direction rather than by pitch: a phone speaker in a noisy
   * room does not carry a melody, but everybody hears up from down.
   */
  it('sends the arriving ones up and the losing ones down', () => {
    for (const cue of ['pickup', 'deliver', 'mine', 'win', 'level'] as const) {
      expect(voiceFor(cue).to).toBeGreaterThan(voiceFor(cue).from)
    }
    for (const cue of ['miss', 'hit'] as const) {
      expect(voiceFor(cue).to).toBeLessThan(voiceFor(cue).from)
    }
  })

  it('gives the ones that are news a second note over the first', () => {
    expect(voiceFor('win').second).toBeDefined()
    expect(voiceFor('level').second).toBeDefined()
    expect(voiceFor('count').second).toBeUndefined()
  })
})
