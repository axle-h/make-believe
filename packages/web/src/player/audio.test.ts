import { describe, expect, it } from 'vitest'
import { createSpeaker } from './audio.js'

/**
 * The waking, which is the whole of what went wrong.
 *
 * A browser only starts an `AudioContext` inside a gesture, and the Join tap
 * used to be the only gesture we listened for — so a phone that walked back
 * into its blob without seeing the join screen was silent for the rest of the
 * evening. That is most phones, most of the time.
 *
 * The context is injected precisely so that this can be a node test: the fake
 * below is an `AudioContext` as far as anything here is concerned, with a
 * `state` the test moves about.
 */

/** Just enough of WebAudio to count the noises, and to be asleep on demand. */
function fakeContext() {
  const node = { connect: () => {}, gain: ramp(), frequency: ramp(), type: '' }
  const context = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    destination: node,
    resumes: 0,
    started: 0,
    /**
     * As a browser does it: the promise settles a tick later, so a cue that
     * arrives during the resume finds a context that is not running yet.
     */
    resume(): Promise<void> {
      context.resumes += 1
      return Promise.resolve().then(() => {
        context.state = 'running'
      })
    },
    createGain: () => ({ ...node, connect: () => {}, gain: ramp() }),
    createOscillator: () => ({
      ...node,
      frequency: ramp(),
      connect: () => {},
      start: () => {
        context.started += 1
      },
      stop: () => {},
    }),
  }
  return context
}

const ramp = () => ({
  setValueAtTime: () => {},
  linearRampToValueAtTime: () => {},
  exponentialRampToValueAtTime: () => {},
})

/** A factory that remembers how many contexts anybody asked it for. */
function speakerOn(muted = false) {
  const made: ReturnType<typeof fakeContext>[] = []
  const speaker = createSpeaker(() => {
    const context = fakeContext()
    made.push(context)
    return context as unknown as AudioContext
  }, muted)
  return { speaker, made, context: () => made[0] }
}

describe('the speaker', () => {
  /**
   * A context made outside a gesture starts suspended, so the resume is asked
   * for and the cue itself falls on a context that is not running yet. Dropped
   * in silence, which is always acceptable.
   */
  it('makes no sound on a cue that arrives before anybody has touched anything', () => {
    const { speaker, context } = speakerOn()

    speaker.play('pickup')

    expect(context()?.started).toBe(0)
  })

  it('makes a sound once something has woken it', async () => {
    const { speaker, context } = speakerOn()

    speaker.wake()
    await Promise.resolve()
    speaker.play('pickup')

    expect(context()?.started).toBeGreaterThan(0)
  })

  /**
   * The other half of the fix. A phone that locked comes back with a suspended
   * context and nothing in the game would ever have woken it again, so every
   * cue asks first.
   */
  it('asks a context that has gone back to sleep to resume', async () => {
    const { speaker, context } = speakerOn()
    speaker.wake()
    await Promise.resolve()
    const before = context()?.resumes ?? 0
    context()!.state = 'suspended'

    speaker.play('deliver')

    expect(context()?.resumes).toBe(before + 1)
  })

  it('keeps the one context rather than making a new one every cue', async () => {
    const { speaker, made } = speakerOn()

    speaker.wake()
    await Promise.resolve()
    speaker.play('pickup')
    speaker.play('win')

    expect(made).toHaveLength(1)
  })

  /** No context, no waking, nothing. That is the whole of what the switch is. */
  it('never makes a context at all while it is muted', () => {
    const { speaker, made } = speakerOn(true)

    speaker.wake()
    speaker.play('pickup')

    expect(made).toHaveLength(0)
  })

  it('starts making noises the moment the switch is turned back on', async () => {
    const { speaker, made, context } = speakerOn(true)
    speaker.play('pickup')
    expect(made).toHaveLength(0)

    speaker.muted = false
    speaker.wake()
    await Promise.resolve()
    speaker.play('pickup')

    expect(context()?.started).toBeGreaterThan(0)
  })

  /** No WebAudio on this browser at all is a game played in silence. */
  it('shrugs at a browser that will not make a context', () => {
    const speaker = createSpeaker(() => {
      throw new Error('no WebAudio here')
    }, false)

    expect(() => {
      speaker.wake()
      speaker.play('go')
    }).not.toThrow()
  })
})
