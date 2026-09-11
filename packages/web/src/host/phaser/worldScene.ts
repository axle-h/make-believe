import { splitHeadline } from '@make-believe/shared'
import Phaser from 'phaser'
import {
  BLOB_CORNER,
  BLOB_SIZE,
  MAX_STEP_MS,
  banner,
  CRATE_SIZE,
  PARCEL_SIZE,
  objectives,
  players,
  tick,
  type Brief,
  type Carryable,
  type DirectorSnapshot,
  type GameState,
  type ObjectiveSnapshot,
  type Obstacle,
  type Player,
  type Sound,
  type Zone,
  roofHeight,
} from '../game/index.js'
import { WORLD_SCENE_KEY } from './sceneKey.js'
import { cropToBlob } from './skin.js'
import {
  drawnCentre,
  drawnTop,
  poseOf,
  restingSquelch,
  stepSquelch,
  type Pose,
  type Squelch,
} from './squelch.js'

/**
 * Renders the model and nothing else. Arcade physics is deliberately off: the
 * model owns every position, and a second integrator here would fight it.
 */

/** Generated once and tinted per blob. */
const BLOB_TEXTURE = 'blob'
const NAME_GAP = 14
const BUBBLE_GAP = 10
const BUBBLE_PADDING = 14
const BUBBLE_RADIUS = 16
const BUBBLE_TAIL = 12
const BUBBLE_WRAP = 360
const BUBBLE_FADE_MS = 250
const AWAY_ALPHA = 0.3

const BANNER_TOP = 24
/** Keeps the banner clear of the QR code in the corner. */
const BANNER_WIDTH = 800
const TIMER_WIDTH = 520
const TIMER_HEIGHT = 8
const TIMER_GAP = 12
/** Never enough to hide a blob. */
const ZONE_FILL_ALPHA = 0.14
/** Opaque and a shade lighter than the floor, so a wall reads as furniture, not a zone. */
const WALL_FILL = 0x2c_33_50
const WALL_EDGE = 0x4a_54_7d
const WALL_EDGE_WIDTH = 4
const WALL_CORNER = 10
const ZONE_EDGE_WIDTH = 6
const ZONE_DIM = 0.35
const SCORE_MARGIN = 26

const THING_CORNER = 8
const THING_EDGE_WIDTH = 4
const ZONE_LABEL_ALPHA = 0.5
const TALLY_GAP = 10

const DEPTH_ZONE = -10
const DEPTH_DANGER = -8
const DEPTH_THING_DOWN = -5
const DEPTH_BLOB = 0
const DEPTH_THING_HELD = 5
const DEPTH_NAME = 10
const DEPTH_BUBBLE = 20
const DEPTH_BANNER = 30

/** In neither `BLOB_COLOURS` nor `ZONE_COLOURS`, so it is never taken for a blob or a spot. */
const DANGER_COLOUR = 0xff_2a_1c
const DANGER_ALPHA = 0.85
const DANGER_WIDTH = 6
const DANGER_RADIUS = BLOB_SIZE * 0.9
const DANGER_SWELL = BLOB_SIZE * 0.22
const DANGER_PERIOD_MS = 900

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '28px',
  fontStyle: 'bold',
  color: '#f4f1ea',
  stroke: '#10121a',
  strokeThickness: 6,
}

const WAITING_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '32px',
  color: 'rgba(244, 241, 234, 0.45)',
}

/** A level is the only brief drawn bigger than the rest. */
const HEADLINE_SIZE = 44
const LEVEL_SIZE = 96

const BANNER_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: `${HEADLINE_SIZE}px`,
  fontStyle: 'bold',
  color: '#f4f1ea',
  align: 'center',
  stroke: '#10121a',
  strokeThickness: 8,
  wordWrap: { width: BANNER_WIDTH },
}

const BANNER_DETAIL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '28px',
  color: 'rgba(244, 241, 234, 0.75)',
  align: 'center',
  stroke: '#10121a',
  strokeThickness: 6,
  wordWrap: { width: BANNER_WIDTH },
}

const TONE_COLOURS: Record<Brief['tone'], string> = {
  task: '#f4f1ea',
  win: '#5ddf7f',
  miss: '#ffd23f',
  level: '#ffd23f',
}

const ZONE_LABEL_SIZE = 22

const ZONE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: `${ZONE_LABEL_SIZE}px`,
  fontStyle: 'bold',
  color: '#10121a',
  align: 'center',
}

/**
 * Every picture is an emoji drawn in `system-ui`, so only glyphs in `SAFE_GLYPHS`
 * (Emoji 5.0, for the TV stick's Emoji 11 font) may reach this style.
 */
const THING_GLYPH_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '30px',
  align: 'center',
}

const TALLY_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '52px',
  fontStyle: 'bold',
  align: 'center',
  stroke: '#10121a',
  strokeThickness: 6,
}

const SCORE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '24px',
  color: 'rgba(244, 241, 234, 0.4)',
  align: 'right',
}

const BUBBLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '30px',
  color: '#10121a',
  align: 'center',
  wordWrap: { width: BUBBLE_WRAP },
}

interface BubbleView {
  container: Phaser.GameObjects.Container
  said: string
}

interface BlobView {
  image: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  bubble: BubbleView | null
  skinKey: string | null
  squelch: Squelch
  /** Last frame's position, so the hop is paced by distance actually moved. */
  atX: number
  atY: number
}

/** The scene knows nothing about the socket; `main.ts` sends what these hand over. */
export interface SceneOptions {
  onBriefs?: (briefs: Brief[]) => void
  /** Blobs the world gave up on; their colours and names are back in the palette. */
  onForgotten?: (playerIds: string[]) => void
  /** The TV makes no sound itself; every cue is played on a phone. */
  onSounds?: (sounds: Sound[]) => void
}

export class WorldScene extends Phaser.Scene {
  private readonly state: GameState
  private readonly options: SceneOptions
  private readonly views = new Map<string, BlobView>()
  private waiting: Phaser.GameObjects.Text | null = null
  private floor: Phaser.GameObjects.Graphics | null = null
  private floorFor = ''
  private readonly zoneLabels = new Map<string, Phaser.GameObjects.Text>()
  private readonly tallies = new Map<string, Phaser.GameObjects.Text>()
  private readonly glyphs = new Map<string, Phaser.GameObjects.Text>()
  private danger: Phaser.GameObjects.Graphics | null = null
  private thingsDown: Phaser.GameObjects.Graphics | null = null
  private thingsHeld: Phaser.GameObjects.Graphics | null = null
  /** Three pieces, because Phaser's `Text` cannot paint one word of a line. */
  private headline: Phaser.GameObjects.Text | null = null
  private headlineWord: Phaser.GameObjects.Text | null = null
  private headlineAfter: Phaser.GameObjects.Text | null = null
  private detail: Phaser.GameObjects.Text | null = null
  private timer: Phaser.GameObjects.Graphics | null = null
  private score: Phaser.GameObjects.Text | null = null

  constructor(state: GameState, options: SceneOptions = {}) {
    super(WORLD_SCENE_KEY)
    this.state = state
    this.options = options
  }

  /** What reached the screen, as opposed to what the model says; e2e compares the two. */
  wornTextures(): Record<string, string> {
    const worn: Record<string, string> = {}
    for (const [playerId, view] of this.views) worn[playerId] = view.image.texture.key
    return worn
  }

  create(): void {
    const graphics = this.add.graphics()
    graphics.fillStyle(0xffffff, 1)
    graphics.fillRoundedRect(0, 0, BLOB_SIZE, BLOB_SIZE, BLOB_CORNER)
    graphics.generateTexture(BLOB_TEXTURE, BLOB_SIZE, BLOB_SIZE)
    graphics.destroy()

    this.waiting = this.add
      .text(this.state.world.width / 2, this.state.world.height / 2, 'Waiting for players…', WAITING_STYLE)
      .setOrigin(0.5, 0.5)

    this.floor = this.add.graphics().setDepth(DEPTH_ZONE)
    this.danger = this.add.graphics().setDepth(DEPTH_DANGER)
    this.thingsDown = this.add.graphics().setDepth(DEPTH_THING_DOWN)
    this.thingsHeld = this.add.graphics().setDepth(DEPTH_THING_HELD)
    this.timer = this.add.graphics().setDepth(DEPTH_BANNER)
    const middle = this.state.world.width / 2
    this.headline = this.add.text(middle, BANNER_TOP, '', BANNER_STYLE).setOrigin(0.5, 0).setDepth(DEPTH_BANNER)
    this.headlineWord = this.add
      .text(middle, BANNER_TOP, '', BANNER_STYLE)
      .setOrigin(0, 0)
      .setVisible(false)
      .setDepth(DEPTH_BANNER)
    this.headlineAfter = this.add
      .text(middle, BANNER_TOP, '', BANNER_STYLE)
      .setOrigin(0, 0)
      .setVisible(false)
      .setDepth(DEPTH_BANNER)
    this.detail = this.add.text(middle, BANNER_TOP, '', BANNER_DETAIL_STYLE).setOrigin(0.5, 0).setDepth(DEPTH_BANNER)
    this.score = this.add
      .text(
        this.state.world.width - SCORE_MARGIN,
        this.state.world.height - SCORE_MARGIN,
        '',
        SCORE_STYLE,
      )
      .setOrigin(1, 1)
      .setDepth(DEPTH_BANNER)
  }

  override update(_time: number, delta: number): void {
    // A backgrounded tab returns an enormous delta; capping it stops blobs teleporting.
    const step = Math.min(delta, MAX_STEP_MS)
    const result = tick(this.state, step)
    if (result.briefs.length > 0) this.options.onBriefs?.(result.briefs)
    if (result.removed.length > 0) this.options.onForgotten?.(result.removed)
    if (result.sounds.length > 0) this.options.onSounds?.(result.sounds)
    this.render(step)
  }

  private render(step: number): void {
    const list = players(this.state)
    const director = objectives(this.state)
    const seen = new Set<string>()

    const badges = badgesByPlayer(director)

    // Fuzzy is the task's "out": still driving, drawn faint, and gone when the task ends.
    const fuzzy = new Set(director.objective?.fuzzy ?? [])
    for (const player of list) {
      seen.add(player.playerId)
      const view = this.views.get(player.playerId) ?? this.createView(player)
      const alpha = player.away || fuzzy.has(player.playerId) ? AWAY_ALPHA : 1

      const pose = this.squelchOf(view, player, step)
      view.image
        .setPosition(player.x, drawnCentre(player.y, pose))
        .setDisplaySize(BLOB_SIZE * pose.scaleX, BLOB_SIZE * pose.scaleY)
        .setRotation(pose.rotation)
        .setAlpha(alpha)
      view.label.setPosition(player.x, drawnTop(player.y, pose) - NAME_GAP).setAlpha(alpha)
      const named = nameWithBadges(player.name, badges.get(player.playerId))
      if (view.label.text !== named) view.label.setText(named)

      this.renderBubble(view, player)
      this.renderSkin(view, player)
    }

    for (const [playerId, view] of this.views) {
      if (seen.has(playerId)) continue
      this.destroyBubble(view)
      this.forgetSkin(view.skinKey)
      view.image.destroy()
      view.label.destroy()
      this.views.delete(playerId)
    }

    this.waiting?.setVisible(list.length === 0)
    this.renderDanger(director.objective, list)
    this.renderFloor(director.objective)
    this.renderThings(director.objective)
    this.renderTallies(director.objective)
    this.renderBanner(director.objective)
    this.renderScore(director)
  }

  private renderScore(director: DirectorSnapshot): void {
    const score = this.score
    if (!score) return
    const line = `Level ${director.level} · ${director.score}`
    if (score.text !== line) score.setText(line)
  }

  /**
   * Behind the blob, never over it: the middle of a blob is the child's drawing,
   * and nothing is painted on it nor its texture swapped for a state.
   */
  private renderDanger(objective: ObjectiveSnapshot | null, list: readonly Player[]): void {
    const ring = this.danger
    if (!ring) return
    ring.clear()
    const marked = new Set(objective?.danger ?? [])
    if (marked.size === 0) return

    const along = Math.sin((this.time.now / DANGER_PERIOD_MS) * Math.PI * 2)
    const radius = DANGER_RADIUS + along * DANGER_SWELL
    ring.lineStyle(DANGER_WIDTH, DANGER_COLOUR, DANGER_ALPHA)
    for (const player of list) {
      if (!marked.has(player.playerId) || player.away) continue
      ring.strokeCircle(player.x, player.y, radius)
    }
  }

  private renderFloor(objective: ObjectiveSnapshot | null): void {
    const zones = objective?.zones ?? []
    const walls = objective?.obstacles ?? []
    const signature = [...zones.map(zoneSignature), ...walls.map(wallSignature)].join('|')
    if (signature === this.floorFor) return
    this.floorFor = signature

    const floor = this.floor
    if (!floor) return
    floor.clear()
    for (const zone of zones) this.drawZone(floor, zone)
    // All outlines, then all fills, so an outline inside another wall is painted
    // over and a maze's T-junctions show only the outer silhouette.
    for (const wall of walls) strokeWall(floor, wall)
    for (const wall of walls) fillWall(floor, wall)
    this.renderZoneLabels(zones)
  }

  private renderZoneLabels(zones: Zone[]): void {
    const named = new Set<string>()
    for (const zone of zones) {
      if (!zone.label) continue
      named.add(zone.id)
      const label = this.zoneLabels.get(zone.id) ?? this.createZoneLabel(zone.id)
      const size = zone.labelSize ?? ZONE_LABEL_SIZE
      if (label.style.fontSize !== `${size}px`) label.setFontSize(size)
      if (label.text !== zone.label) label.setText(zone.label)
      label
        .setPosition(zone.x, zone.y)
        .setColor(zone.colour)
        .setAlpha(zone.dim === true ? ZONE_LABEL_ALPHA * ZONE_DIM : ZONE_LABEL_ALPHA)
    }
    for (const [id, label] of this.zoneLabels) {
      if (named.has(id)) continue
      label.destroy()
      this.zoneLabels.delete(id)
    }
  }

  private createZoneLabel(id: string): Phaser.GameObjects.Text {
    const label = this.add.text(0, 0, '', ZONE_LABEL_STYLE).setOrigin(0.5, 0.5).setDepth(DEPTH_ZONE)
    this.zoneLabels.set(id, label)
    return label
  }

  /** Redrawn every frame, unlike the floor: a carried thing must keep up with its carrier. */
  private renderThings(objective: ObjectiveSnapshot | null): void {
    const down = this.thingsDown
    const held = this.thingsHeld
    if (!down || !held) return
    down.clear()
    held.clear()

    const drawn = new Set<string>()
    for (const hazard of objective?.hazards ?? []) {
      drawn.add(hazard.id)
      this.renderGlyph({ id: hazard.id, x: hazard.x, y: hazard.y, glyph: hazard.glyph })
      held.fillStyle(0xf4f1ea, 0.16)
      held.fillCircle(hazard.x, hazard.y, hazard.size / 2)
    }
    for (const thing of objective?.carryables ?? []) {
      // A delivered parcel is counted by its depot's tally rather than drawn.
      if (thing.kind === 'parcel' && thing.home !== null) continue
      const carried = thing.kind === 'parcel' && thing.carriedBy !== null
      this.drawThing(carried ? held : down, thing)
      if (thing.glyph !== undefined) {
        drawn.add(thing.id)
        this.renderGlyph(thing)
      }
    }
    for (const [id, glyph] of this.glyphs) {
      if (drawn.has(id)) continue
      glyph.destroy()
      this.glyphs.delete(id)
    }
  }

  /** The square underneath keeps the colour that matters; sorting is played by colour. */
  private renderGlyph(thing: { id: string; x: number; y: number; glyph?: string }): void {
    const glyph = this.glyphs.get(thing.id) ?? this.createGlyph(thing.id)
    if (glyph.text !== thing.glyph) glyph.setText(thing.glyph ?? '')
    glyph.setPosition(thing.x, thing.y)
  }

  private createGlyph(id: string): Phaser.GameObjects.Text {
    const glyph = this.add
      .text(0, 0, '', THING_GLYPH_STYLE)
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH_THING_HELD)
    this.glyphs.set(id, glyph)
    return glyph
  }

  /** Under a labelled depot rather than in its middle, so word and number never overlap. */
  private renderTallies(objective: ObjectiveSnapshot | null): void {
    const parcels = (objective?.carryables ?? []).filter((thing) => thing.kind === 'parcel')
    const counted = new Set<string>()

    if (parcels.length > 0) {
      for (const zone of objective?.zones ?? []) {
        const home = parcels.filter((parcel) => parcel.home === zone.id).length
        if (home === 0) continue
        counted.add(zone.id)
        const tally = this.tallies.get(zone.id) ?? this.createTally(zone.id)
        const said = String(home)
        if (tally.text !== said) tally.setText(said)
        const under = zone.label !== undefined
        tally
          .setOrigin(0.5, under ? 0 : 0.5)
          .setPosition(zone.x, under ? zone.y + zoneFoot(zone) + TALLY_GAP : zone.y)
          .setColor(zone.colour)
      }
    }

    for (const [id, tally] of this.tallies) {
      if (counted.has(id)) continue
      tally.destroy()
      this.tallies.delete(id)
    }
  }

  private createTally(id: string): Phaser.GameObjects.Text {
    const tally = this.add.text(0, 0, '', TALLY_STYLE).setOrigin(0.5, 0.5).setDepth(DEPTH_NAME)
    this.tallies.set(id, tally)
    return tally
  }

  private drawThing(into: Phaser.GameObjects.Graphics, thing: Carryable): void {
    const colour = Phaser.Display.Color.HexStringToColor(thing.colour).color
    const size = thing.kind === 'crate' ? CRATE_SIZE : PARCEL_SIZE
    const left = thing.x - size / 2
    const top = thing.y - size / 2
    const alpha = thing.home === null ? 1 : 0.55

    into.fillStyle(colour, alpha)
    into.lineStyle(THING_EDGE_WIDTH, 0x10121a, alpha)
    into.fillRoundedRect(left, top, size, size, THING_CORNER)
    into.strokeRoundedRect(left, top, size, size, THING_CORNER)

    if (thing.kind !== 'crate') return
    into.lineBetween(left, thing.y, left + size, thing.y)
    into.lineBetween(thing.x, top, thing.x, top + size)
  }

  private drawZone(floor: Phaser.GameObjects.Graphics, zone: Zone): void {
    const colour = Phaser.Display.Color.HexStringToColor(zone.colour).color
    const lit = zone.dim !== true
    floor.fillStyle(colour, lit ? ZONE_FILL_ALPHA : ZONE_FILL_ALPHA * ZONE_DIM)
    floor.lineStyle(ZONE_EDGE_WIDTH, colour, lit ? 0.9 : 0.9 * ZONE_DIM)
    if (zone.shape === 'circle') {
      floor.fillCircle(zone.x, zone.y, zone.radius)
      floor.strokeCircle(zone.x, zone.y, zone.radius)
      return
    }
    const left = zone.x - zone.width / 2
    const top = zone.y - zone.height / 2
    floor.fillRoundedRect(left, top, zone.width, zone.height, 18)
    floor.strokeRoundedRect(left, top, zone.width, zone.height, 18)
    // Only the body counts as home; the roof is decoration.
    if (zone.shape !== 'house') return
    const roof = roofHeight(zone)
    const eaves = zone.width * 0.08
    floor.fillTriangle(left - eaves, top, zone.x + zone.width / 2 + eaves, top, zone.x, top - roof)
    floor.strokeTriangle(left - eaves, top, zone.x + zone.width / 2 + eaves, top, zone.x, top - roof)
  }

  /** The same line the phones are told. */
  private renderBanner(objective: ObjectiveSnapshot | null): void {
    const headline = this.headline
    const word = this.headlineWord
    const after = this.headlineAfter
    const detail = this.detail
    if (!headline || !word || !after || !detail) return

    const line = banner(this.state)
    const tone = line?.tone ?? 'task'
    const text = line?.headline ?? ''
    const parts = splitHeadline(text, line?.emphasis)
    const painted = parts.word.length > 0
    // Setting the size re-wraps and re-measures, so only when it has changed.
    const size = tone === 'level' ? LEVEL_SIZE : HEADLINE_SIZE
    for (const piece of [headline, word, after]) {
      if (piece.style.fontSize !== `${size}px`) piece.setFontSize(size)
    }
    if (headline.text !== parts.before) headline.setText(parts.before)
    if (word.text !== parts.word) word.setText(parts.word)
    if (after.text !== parts.after) after.setText(parts.after)
    headline.setVisible(text.length > 0).setColor(TONE_COLOURS[tone])
    word.setVisible(painted).setColor(line?.colour ?? TONE_COLOURS[tone])
    after.setVisible(painted).setColor(TONE_COLOURS[tone])
    this.layOutHeadline(painted)

    const under = line?.detail ?? ''
    if (detail.text !== under) detail.setText(under)
    detail.setVisible(text.length > 0 && under.length > 0).setY(headline.y + headline.height)

    this.renderTimer(
      objective,
      detail.visible ? detail.y + detail.height : headline.y + headline.height,
    )
  }

  private layOutHeadline(painted: boolean): void {
    const headline = this.headline
    const word = this.headlineWord
    const after = this.headlineAfter
    if (!headline || !word || !after) return

    const middle = this.state.world.width / 2
    if (!painted) {
      headline.setOrigin(0.5, 0).setX(middle)
      return
    }
    const left = middle - (headline.width + word.width + after.width) / 2
    headline.setOrigin(0, 0).setX(left)
    word.setX(left + headline.width)
    after.setX(left + headline.width + word.width)
  }

  private renderTimer(objective: ObjectiveSnapshot | null, top: number): void {
    const timer = this.timer
    if (!timer) return
    timer.clear()

    if (!objective || objective.outcome !== 'running' || objective.totalMs <= 0) return
    if (objective.clock === 'held') return

    const left = (this.state.world.width - TIMER_WIDTH) / 2
    const y = top + TIMER_GAP
    const share = Math.max(0, Math.min(1, objective.remainingMs / objective.totalMs))
    const filled = TIMER_WIDTH * share
    timer.fillStyle(0xf4f1ea, 0.18)
    timer.fillRoundedRect(left, y, TIMER_WIDTH, TIMER_HEIGHT, TIMER_HEIGHT / 2)
    // A rounded rectangle narrower than its corners draws as a smudge.
    if (filled >= TIMER_HEIGHT) {
      timer.fillStyle(0xf4f1ea, 0.7)
      timer.fillRoundedRect(left, y, filled, TIMER_HEIGHT, TIMER_HEIGHT / 2)
    }
  }

  private createView(player: Player): BlobView {
    const image = this.add
      .image(player.x, player.y, BLOB_TEXTURE)
      .setDisplaySize(BLOB_SIZE, BLOB_SIZE)
      .setTint(Phaser.Display.Color.HexStringToColor(player.colour).color)
      .setDepth(DEPTH_BLOB)
    const label = this.add
      .text(player.x, player.y, player.name, NAME_STYLE)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_NAME)
    const view: BlobView = {
      image,
      label,
      bubble: null,
      skinKey: null,
      squelch: restingSquelch(),
      atX: player.x,
      atY: player.y,
    }
    this.views.set(player.playerId, view)
    return view
  }

  private squelchOf(view: BlobView, player: Player, step: number): Pose {
    view.squelch = stepSquelch(view.squelch, player.x - view.atX, player.y - view.atY, step)
    view.atX = player.x
    view.atY = player.y
    return poseOf(view.squelch)
  }

  private renderSkin(view: BlobView, player: Player): void {
    const skin = player.skin
    if (!skin || view.skinKey === skin.key) return

    const previous = view.skinKey
    const { playerId } = player
    const { key } = skin
    view.skinKey = key
    if (this.textures.exists(key)) {
      this.wearSkin(view, playerId, key, previous)
      return
    }
    void cropToBlob(skin.png).then((cropped) => {
      // A newer drawing, or the blob leaving, makes this one unwanted.
      if (view.skinKey !== key || this.textures.exists(key)) return
      if (cropped) {
        this.textures.addCanvas(key, cropped)
        this.wearSkin(view, playerId, key, previous)
        return
      }
      // Uncropped is better than blank, so a picture the canvas could not take goes to Phaser as it came.
      this.textures.once(`addtexture-${key}`, () =>
        this.wearSkin(view, playerId, key, previous),
      )
      this.textures.addBase64(key, skin.png)
    })
  }

  private wearSkin(
    view: BlobView,
    playerId: string,
    key: string,
    previous: string | null,
  ): void {
    // A quick second drawing can land while the first is still decoding.
    if (view.skinKey !== key) return
    view.image.setTexture(key).setDisplaySize(BLOB_SIZE, BLOB_SIZE).clearTint()
    if (previous !== key) this.forgetSkin(previous)
  }

  private forgetSkin(key: string | null): void {
    if (key && this.textures.exists(key)) this.textures.remove(key)
  }

  private renderBubble(view: BlobView, player: Player): void {
    const said = player.bubble?.text ?? null

    if (said === null) {
      this.fadeBubble(view)
      return
    }
    if (view.bubble?.said !== said) {
      this.destroyBubble(view)
      view.bubble = this.createBubble(said)
    }
    view.bubble.container
      .setPosition(player.x, view.label.y - view.label.height - BUBBLE_GAP - BUBBLE_TAIL)
      .setAlpha(player.away ? AWAY_ALPHA : 1)
  }

  private createBubble(said: string): BubbleView {
    const label = this.add.text(0, 0, said, BUBBLE_STYLE).setOrigin(0.5, 1)
    const width = label.width + BUBBLE_PADDING * 2
    const height = label.height + BUBBLE_PADDING * 2
    label.setPosition(0, -BUBBLE_PADDING)

    const background = this.add.graphics()
    background.fillStyle(0xf4f1ea, 1)
    background.fillRoundedRect(-width / 2, -height, width, height, BUBBLE_RADIUS)
    background.fillTriangle(-BUBBLE_TAIL, -1, BUBBLE_TAIL, -1, 0, BUBBLE_TAIL)

    const container = this.add.container(0, 0, [background, label]).setDepth(DEPTH_BUBBLE)
    return { container, said }
  }

  private fadeBubble(view: BlobView): void {
    const bubble = view.bubble
    if (!bubble) return
    view.bubble = null
    this.tweens.add({
      targets: bubble.container,
      alpha: 0,
      y: bubble.container.y - 20,
      duration: BUBBLE_FADE_MS,
      onComplete: () => bubble.container.destroy(),
    })
  }

  private destroyBubble(view: BlobView): void {
    view.bubble?.container.destroy()
    view.bubble = null
  }
}

/** The world's marks (the crown) and the running task's, by `playerId`. */
function badgesByPlayer(director: DirectorSnapshot): Map<string, string> {
  const badges = new Map<string, string>()
  for (const mark of [...director.marks, ...(director.objective?.marks ?? [])]) {
    badges.set(mark.playerId, (badges.get(mark.playerId) ?? '') + mark.badge)
  }
  return badges
}

/** Badges go beside the name, never over the blob's middle, which is the child's drawing. */
function nameWithBadges(name: string, badges: string | undefined): string {
  return badges ? `${badges} ${name}` : name
}

function zoneFoot(zone: Zone): number {
  return zone.shape === 'circle' ? zone.radius : zone.height / 2
}

/** Two functions for the two passes in `renderFloor`. */
function strokeWall(floor: Phaser.GameObjects.Graphics, wall: Obstacle): void {
  floor.lineStyle(WALL_EDGE_WIDTH, WALL_EDGE, 1)
  aboutItsMiddle(floor, wall, (left, top, radius) => {
    floor.strokeRoundedRect(left, top, wall.width, wall.height, radius)
  })
}

function fillWall(floor: Phaser.GameObjects.Graphics, wall: Obstacle): void {
  floor.fillStyle(WALL_FILL, 1)
  aboutItsMiddle(floor, wall, (left, top, radius) => {
    floor.fillRoundedRect(left, top, wall.width, wall.height, radius)
  })
}

/**
 * About its own middle, so a turned bar is drawn turned. The radius is cut back
 * on thin walls, or a row of maze walls reads as lozenges.
 */
function aboutItsMiddle(
  floor: Phaser.GameObjects.Graphics,
  wall: Obstacle,
  draw: (left: number, top: number, radius: number) => void,
): void {
  floor.save()
  floor.translateCanvas(wall.x, wall.y)
  if (wall.angle !== undefined) floor.rotateCanvas(wall.angle)
  draw(
    -wall.width / 2,
    -wall.height / 2,
    Math.min(WALL_CORNER, Math.min(wall.width, wall.height) / 3),
  )
  floor.restore()
}

/** Must include position and angle, or a bobbing or turning bar is never redrawn. */
function wallSignature(wall: Obstacle): string {
  const turn = Math.round((wall.angle ?? 0) * 100)
  return `${wall.id}:${Math.round(wall.x)}:${Math.round(wall.y)}:${wall.width}x${wall.height}:${turn}`
}

/** Must include position, size, dimming and label, or those changes are never redrawn. */
function zoneSignature(zone: Zone): string {
  // Rounded, so a shrinking island does not redraw the floor every frame.
  const size =
    zone.shape === 'circle' ? Math.round(zone.radius) : `${zone.width}x${zone.height}`
  const at = `${Math.round(zone.x)}:${Math.round(zone.y)}`
  return `${zone.id}:${zone.shape}:${at}:${size}:${zone.colour}:${zone.dim === true}:${zone.label ?? ''}`
}
