import { splitHeadline } from '@make-believe/shared'
import Phaser from 'phaser'
import {
  BLOB_CORNER,
  BLOB_SIZE,
  MAX_STEP_MS,
  banner,
  CRATE_SIZE,
  noteSkinColour,
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
import { colourOfImage } from './skinColour.js'

/**
 * The one scene. It renders the model and nothing else: the model moves the
 * blobs, so this layer stays thin enough that it needs no tests of its own.
 */

/** A white rounded square, generated once and tinted per blob. */
const BLOB_TEXTURE = 'blob'
/** Pixels between the top of a blob and its name. */
const NAME_GAP = 14
/** Pixels between a name and the bubble above it. */
const BUBBLE_GAP = 10
const BUBBLE_PADDING = 14
const BUBBLE_RADIUS = 16
const BUBBLE_TAIL = 12
const BUBBLE_WRAP = 360
const BUBBLE_FADE_MS = 250
const AWAY_ALPHA = 0.3

/** How far in from the top of the screen the banner sits. */
const BANNER_TOP = 24
/** The banner keeps clear of the QR code in the corner. */
const BANNER_WIDTH = 800
/** The timer bar: how wide it can get, and how thick it is. */
const TIMER_WIDTH = 520
const TIMER_HEIGHT = 8
/** Gap between the banner's last line and the bar under it. */
const TIMER_GAP = 12
/** How see-through a zone's fill is. Enough to read, never enough to hide a blob. */
const ZONE_FILL_ALPHA = 0.14
/**
 * A wall is solid, which is the opposite of a zone: a zone is a place to stand
 * and a wall is a place you cannot. It is drawn opaque and a shade lighter than
 * the floor so that it reads as furniture rather than as a spot to aim at.
 */
const WALL_FILL = 0x2c_33_50
const WALL_EDGE = 0x4a_54_7d
const WALL_EDGE_WIDTH = 4
const WALL_CORNER = 10
const ZONE_EDGE_WIDTH = 6
/** How much of itself a zone keeps while it is waiting its turn to light up. */
const ZONE_DIM = 0.35
/** How far the score sits from the corner it lives in. */
const SCORE_MARGIN = 26

/** A parcel is a small bright square; a crate is a big one with a cross on it. */
const THING_CORNER = 8
const THING_EDGE_WIDTH = 4
/** The name written on a depot, for whoever in the room can read it. */
const ZONE_LABEL_ALPHA = 0.5
/** How far under a labelled zone its tally sits, when it cannot go in the middle. */
const TALLY_GAP = 10

/** The floor is under everything; blobs, names and bubbles stack over it. */
const DEPTH_ZONE = -10
/** Things lying about are on the floor; things being carried are held up. */
const DEPTH_THING_DOWN = -5
const DEPTH_BLOB = 0
const DEPTH_THING_HELD = 5
const DEPTH_NAME = 10
const DEPTH_BUBBLE = 20
/** What the world is asking for goes over the lot; it is the point of looking up. */
const DEPTH_BANNER = 30

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

/**
 * How big the banner's first line is: the usual size, and the size a new level
 * gets. Going up a rung is the only thing all evening that is about the
 * children rather than the game, so it is the only thing that grows.
 */
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

/** The banner is tinted by what has just happened, so a glance is enough. */
const TONE_COLOURS: Record<Brief['tone'], string> = {
  task: '#f4f1ea',
  win: '#5ddf7f',
  miss: '#ffd23f',
  level: '#ffd23f',
}


/**
 * How well the room is doing. It is deliberately the quietest thing on screen:
 * a number to notice going up, never a scoreboard to play towards, and nothing
 * a child has to be able to read to play.
 */
/** What a depot is called, written across it. */
const ZONE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '22px',
  fontStyle: 'bold',
  color: '#10121a',
  align: 'center',
}

/**
 * How many things have been brought to a depot: one number, big, in the middle
 * of it. The parcels themselves used to stay where they landed and pile up
 * into a heap nobody could count, which told a room less than a numeral does
 * and looked like a mess on the floor.
 */
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

/** What a blob is saying, drawn as a rounded box with a tail. */
interface BubbleView {
  container: Phaser.GameObjects.Container
  /** The words this bubble was built for, so it is only rebuilt when they change. */
  said: string
}

/** Everything on screen that belongs to one blob. */
interface BlobView {
  image: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  bubble: BubbleView | null
  /** The drawing this blob is wearing, or being given: a texture key. */
  skinKey: string | null
  /** Its bounce, and where it was last frame so the hop can be paced by it. */
  squelch: Squelch
  atX: number
  atY: number
}

/** What the scene does with the model beyond drawing it. */
export interface SceneOptions {
  /**
   * What the phones need to hear, handed over as `tick` produces it. The scene
   * still knows nothing about the socket; `main.ts` owns that and does the
   * sending.
   */
  onBriefs?: (briefs: Brief[]) => void
  /**
   * Blobs the world has waited long enough for and given up on. Their colours
   * and names have gone back into the palette, and a phone sitting on a join
   * screen wants to know. Same arrangement as `onBriefs`: the scene knows
   * nothing about the socket.
   */
  onForgotten?: (playerIds: string[]) => void
}

export class WorldScene extends Phaser.Scene {
  private readonly state: GameState
  private readonly options: SceneOptions
  private readonly views = new Map<string, BlobView>()
  private waiting: Phaser.GameObjects.Text | null = null
  /** The floor markings, redrawn only when the zones themselves change. */
  private floor: Phaser.GameObjects.Graphics | null = null
  /** What the floor was last drawn for, so it is not redrawn every frame. */
  private floorFor = ''
  /** What each zone is called, written on it. Kept by zone id. */
  private readonly zoneLabels = new Map<string, Phaser.GameObjects.Text>()
  /** How many parcels each depot is holding, written on it. Kept by zone id. */
  private readonly tallies = new Map<string, Phaser.GameObjects.Text>()
  /** Parcels and crates: on the floor, and in somebody's arms. */
  private thingsDown: Phaser.GameObjects.Graphics | null = null
  private thingsHeld: Phaser.GameObjects.Graphics | null = null
  /**
   * The banner's first line, in three pieces. Most briefs use only the first
   * and it is centred on its own; a brief that names one word of its headline
   * — "everybody go **green**" — gets that word in the middle piece, painted,
   * with the three of them laid out along one baseline. Phaser's `Text` has no
   * rich text in it, so three objects is what a coloured word costs.
   */
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

  /**
   * Which texture each blob is actually wearing. The model says which drawing
   * a blob *should* have; this says what reached the screen, which is the only
   * way an end-to-end test can tell the two apart.
   */
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
    // A backgrounded tab hands back an enormous delta on its first frame;
    // capping it here is what stops everyone teleporting into a wall.
    const step = Math.min(delta, MAX_STEP_MS)
    const result = tick(this.state, step)
    if (result.briefs.length > 0) this.options.onBriefs?.(result.briefs)
    if (result.removed.length > 0) this.options.onForgotten?.(result.removed)
    this.render(step)
  }

  private render(step: number): void {
    const list = players(this.state)
    // One read of the objective for the whole frame; four separate ones would
    // rebuild the same snapshot four times over.
    const director = objectives(this.state)
    const seen = new Set<string>()

    // Whatever the task has pinned to particular blobs, ready to be read out of
    // in the loop below: a badge is part of a blob's name, not a thing sitting
    // on top of it.
    const badges = badgesByPlayer(director)

    for (const player of list) {
      seen.add(player.playerId)
      const view = this.views.get(player.playerId) ?? this.createView(player)
      const alpha = player.away ? AWAY_ALPHA : 1

      const pose = this.squelchOf(view, player, step)
      view.image
        .setPosition(player.x, drawnCentre(player.y, pose))
        .setDisplaySize(BLOB_SIZE * pose.scaleX, BLOB_SIZE * pose.scaleY)
        .setRotation(pose.rotation)
        .setAlpha(alpha)
      // The name rides the bounce rather than hanging in the air over it: a
      // blob and its label are one character, and a fixed gap from the top of
      // the blob is the only way they never end up on top of each other.
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
    this.renderFloor(director.objective)
    this.renderThings(director.objective)
    this.renderTallies(director.objective)
    this.renderBanner(director.objective)
    this.renderScore(director)
  }

  /** How the room is doing, in the corner, for whoever cares to look. */
  private renderScore(director: DirectorSnapshot): void {
    const score = this.score
    if (!score) return
    const line = `Level ${director.level} · ${director.score}`
    if (score.text !== line) score.setText(line)
  }

  /**
   * The zones on the floor. They are the objective as far as a three-year-old
   * is concerned — the banner explains, but the spot is the thing they look at
   * — so they are drawn plainly and under everybody's feet.
   */
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
    for (const wall of objective?.obstacles ?? []) drawWall(floor, wall)
    this.renderZoneLabels(zones)
  }

  /**
   * What a zone is called, written across it — HOME, or the colour a depot
   * takes. Most zones have no name at all: the spot to stand on is a spot to
   * stand on, and a word on it would be a word nobody needs to read.
   */
  private renderZoneLabels(zones: Zone[]): void {
    const named = new Set<string>()
    for (const zone of zones) {
      if (!zone.label) continue
      named.add(zone.id)
      const label = this.zoneLabels.get(zone.id) ?? this.createZoneLabel(zone.id)
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

  /**
   * The parcels and the crates. They move every frame, so unlike the floor
   * they are redrawn every frame — there are never more than a handful, and a
   * thing being carried has to keep up with the blob carrying it.
   *
   * What is being held is drawn over its carrier and what is lying about is
   * drawn under everybody, so "who has got one" needs no reading either.
   */
  private renderThings(objective: ObjectiveSnapshot | null): void {
    const down = this.thingsDown
    const held = this.thingsHeld
    if (!down || !held) return
    down.clear()
    held.clear()

    for (const thing of objective?.carryables ?? []) {
      // A delivered parcel is counted rather than drawn: a dozen of them
      // landing on one spot used to stack into a heap that said less about how
      // far the room had got than the number written over it does.
      if (thing.kind === 'parcel' && thing.home !== null) continue
      const carried = thing.kind === 'parcel' && thing.carriedBy !== null
      this.drawThing(carried ? held : down, thing)
    }
  }

  /**
   * The number on each depot. It changes as things arrive rather than when the
   * floor does, so unlike the labels it is placed every frame — there are never
   * more than a handful of depots.
   *
   * It goes in the middle of a depot that has nothing written on it, and just
   * under one that has, so a word and a number never sit on top of each other.
   */
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
    // A delivered thing sits quietly: it is done with, and the eye should go
    // to whatever is still out on the floor.
    const alpha = thing.home === null ? 1 : 0.55

    into.fillStyle(colour, alpha)
    into.lineStyle(THING_EDGE_WIDTH, 0x10121a, alpha)
    into.fillRoundedRect(left, top, size, size, THING_CORNER)
    into.strokeRoundedRect(left, top, size, size, THING_CORNER)

    if (thing.kind !== 'crate') return
    // The tape across a crate, which is what stops it reading as a big parcel.
    into.lineBetween(left, thing.y, left + size, thing.y)
    into.lineBetween(thing.x, top, thing.x, top + size)
  }

  private drawZone(floor: Phaser.GameObjects.Graphics, zone: Zone): void {
    const colour = Phaser.Display.Color.HexStringToColor(zone.colour).color
    // A dim pad is one that is on the floor but is not what the world is
    // asking for this second. It has to be plainly there and plainly not lit.
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
    // A roof, and nothing else: the body is the whole of where a parcel counts
    // as home, and the triangle over it is what makes that legible without a
    // word of the brief being read.
    if (zone.shape !== 'house') return
    const roof = roofHeight(zone)
    // Overhanging eaves, so it reads as a house rather than as a hat.
    const eaves = zone.width * 0.08
    floor.fillTriangle(left - eaves, top, zone.x + zone.width / 2 + eaves, top, zone.x, top - roof)
    floor.strokeTriangle(left - eaves, top, zone.x + zone.width / 2 + eaves, top, zone.x, top - roof)
  }

  /**
   * What the world is asking for, across the top. It is the same line the
   * phones are told, so a child looking down and a child looking up are reading
   * the same thing.
   */
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
    // Setting the size re-wraps and re-measures the text, so it is only ever
    // touched when it has actually changed.
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

  /**
   * Where the pieces of the first line sit. One piece is centred on the screen
   * as it always was; three are laid end to end and the group is centred, so
   * the painted word stays part of the sentence rather than becoming a caption
   * of its own.
   */
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

  /** How much of the clock is left, as a bar rather than a number to read. */
  private renderTimer(objective: ObjectiveSnapshot | null, top: number): void {
    const timer = this.timer
    if (!timer) return
    timer.clear()

    if (!objective || objective.outcome !== 'running' || objective.totalMs <= 0) return

    const left = (this.state.world.width - TIMER_WIDTH) / 2
    const y = top + TIMER_GAP
    const share = Math.max(0, Math.min(1, objective.remainingMs / objective.totalMs))
    const filled = TIMER_WIDTH * share
    timer.fillStyle(0xf4f1ea, 0.18)
    timer.fillRoundedRect(left, y, TIMER_WIDTH, TIMER_HEIGHT, TIMER_HEIGHT / 2)
    // A rounded rectangle narrower than its own corners draws as a smudge; the
    // last few pixels of the clock are not worth one.
    if (filled >= TIMER_HEIGHT) {
      timer.fillStyle(0xf4f1ea, 0.7)
      timer.fillRoundedRect(left, y, filled, TIMER_HEIGHT, TIMER_HEIGHT / 2)
    }
  }

  /** A blob arrives on screen: a tinted square with its name above it. */
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

  /**
   * Advance one blob's bounce and say how to draw it this frame.
   *
   * The model has already moved everybody by the time this runs, so what paces
   * the hop is how far a blob actually got — which means a blob shoved across
   * the floor by somebody else bounces along too, and one driving into a wall
   * stands there and does not.
   */
  private squelchOf(view: BlobView, player: Player, step: number): Pose {
    view.squelch = stepSquelch(view.squelch, player.x - view.atX, player.y - view.atY, step)
    view.atX = player.x
    view.atY = player.y
    return poseOf(view.squelch)
  }

  /**
   * A drawing from a phone becomes this blob's texture. It is cut to the
   * blob's rounded outline on the way — the phone lets a child draw right out
   * to the corners of a square, and the shape is put back on here — which
   * needs the PNG decoded first, so the swap waits on that.
   */
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
      // A quick second drawing can land while the first is still decoding, and
      // a blob can leave altogether; either way this one is no longer wanted.
      if (view.skinKey !== key || this.textures.exists(key)) return
      if (cropped) {
        this.textures.addCanvas(key, cropped)
        this.wearSkin(view, playerId, key, previous)
        return
      }
      // A picture that would not decode into a canvas is handed to Phaser as
      // it arrived rather than dropped: an uncropped blob is a great deal
      // better than a blank one. That decodes in the background too, so the
      // swap waits for the texture manager to say the key is ready.
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
    this.tellTheModelItsColour(playerId, key)
  }

  /**
   * What colour that drawing came out, back into the model. It is the one
   * thing that goes that way from here — a task that asks a room to paint
   * itself green has to know, and only the side with a canvas can say.
   */
  private tellTheModelItsColour(playerId: string, key: string): void {
    const image = this.textures.get(key)?.getSourceImage()
    if (!image || image instanceof Phaser.GameObjects.RenderTexture) return
    const colour = colourOfImage(image)
    if (colour) noteSkinColour(this.state, playerId, key, colour)
  }

  /** Drawings are one per player at a time; the old one leaves the GPU. */
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
      // New words: the old bubble goes at once rather than fading under the new.
      this.destroyBubble(view)
      view.bubble = this.createBubble(said)
    }
    view.bubble.container
      // The tail hangs below the box, so it is part of the gap above the name.
      .setPosition(player.x, view.label.y - view.label.height - BUBBLE_GAP - BUBBLE_TAIL)
      .setAlpha(player.away ? AWAY_ALPHA : 1)
  }

  /** A rounded box with a tail, sized to the words inside it. */
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

  /** Let a bubble that has run out of time drift away rather than blink out. */
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

/**
 * Whatever has been pinned to each blob, by `playerId`. Usually empty and
 * never more than one each, but the shape allows for two so that a task which
 * wants to hand out a second badge does not have to change this.
 *
 * Two sources: the running task's own marks, and the world's — which is the
 * crown, still on the head of whoever won it several games ago.
 */
function badgesByPlayer(director: DirectorSnapshot): Map<string, string> {
  const badges = new Map<string, string>()
  for (const mark of [...director.marks, ...(director.objective?.marks ?? [])]) {
    badges.set(mark.playerId, (badges.get(mark.playerId) ?? '') + mark.badge)
  }
  return badges
}

/**
 * A blob's name with its badge on the front of it: "🥔 Wilf".
 *
 * The badge used to be drawn over the middle of the blob, which put it on top
 * of the one thing a child had made themselves — the drawing they are wearing.
 * Above their head it sits beside the name, where the room is already looking
 * to find out who is who, and the picture underneath stays theirs.
 */
function nameWithBadges(name: string, badges: string | undefined): string {
  return badges ? `${badges} ${name}` : name
}

/** How far it is from a zone's middle to its bottom edge. */
function zoneFoot(zone: Zone): number {
  return zone.shape === 'circle' ? zone.radius : zone.height / 2
}

/**
 * A wall. Solid and plainly not a zone: the floor markings are places to go
 * and this is a place to go round.
 */
function drawWall(floor: Phaser.GameObjects.Graphics, wall: Obstacle): void {
  const left = wall.x - wall.width / 2
  const top = wall.y - wall.height / 2
  floor.fillStyle(WALL_FILL, 1)
  floor.lineStyle(WALL_EDGE_WIDTH, WALL_EDGE, 1)
  floor.fillRoundedRect(left, top, wall.width, wall.height, WALL_CORNER)
  floor.strokeRoundedRect(left, top, wall.width, wall.height, WALL_CORNER)
}

/** Walls never move, so their signature is only about which ones there are. */
function wallSignature(wall: Obstacle): string {
  return `${wall.id}:${Math.round(wall.x)}:${Math.round(wall.y)}:${wall.width}x${wall.height}`
}

/** Enough of a zone to tell whether the floor needs redrawing. */
function zoneSignature(zone: Zone): string {
  // Rounded, like the position: a shrinking island changes its radius by a
  // fraction of a pixel every frame, and redrawing the floor for a change
  // nobody can see is a redraw for nothing.
  const size =
    zone.shape === 'circle' ? Math.round(zone.radius) : `${zone.width}x${zone.height}`
  // The dimming is in here because a chain of lights moves by nothing else
  // changing: leave it out and the floor never redraws as the light travels.
  const at = `${Math.round(zone.x)}:${Math.round(zone.y)}`
  return `${zone.id}:${zone.shape}:${at}:${size}:${zone.colour}:${zone.dim === true}`
}
