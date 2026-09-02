import Phaser from 'phaser'
import {
  BLOB_SIZE,
  MAX_STEP_MS,
  banner,
  objectives,
  playerById,
  players,
  tick,
  type Brief,
  type DirectorSnapshot,
  type GameState,
  type ObjectiveSnapshot,
  type Player,
  type Zone,
} from '../game/index.js'
import { WORLD_SCENE_KEY } from './sceneKey.js'

/**
 * The one scene. It renders the model and nothing else: the model moves the
 * blobs, so this layer stays thin enough that it needs no tests of its own.
 */

/** A white rounded square, generated once and tinted per blob. */
const BLOB_TEXTURE = 'blob'
const BLOB_CORNER = 14
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
const ZONE_EDGE_WIDTH = 6
/** How far the score sits from the corner it lives in. */
const SCORE_MARGIN = 26

/** The floor is under everything; blobs, names and bubbles stack over it. */
const DEPTH_ZONE = -10
const DEPTH_BLOB = 0
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

const BANNER_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '44px',
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
}

/** What the world has pinned to a blob, worn in the middle of it. */
const MARK_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '46px',
  align: 'center',
}

/**
 * How well the room is doing. It is deliberately the quietest thing on screen:
 * a number to notice going up, never a scoreboard to play towards, and nothing
 * a child has to be able to read to play.
 */
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
}

/** What the scene does with the model beyond drawing it. */
export interface SceneOptions {
  /**
   * What the phones need to hear, handed over as `tick` produces it. The scene
   * still knows nothing about the socket; `main.ts` owns that and does the
   * sending.
   */
  onBriefs?: (briefs: Brief[]) => void
}

export class WorldScene extends Phaser.Scene {
  private readonly state: GameState
  private readonly options: SceneOptions
  private readonly views = new Map<string, BlobView>()
  /** Whatever the task has pinned to a blob, by `playerId`. */
  private readonly marks = new Map<string, Phaser.GameObjects.Text>()
  private waiting: Phaser.GameObjects.Text | null = null
  /** The floor markings, redrawn only when the zones themselves change. */
  private floor: Phaser.GameObjects.Graphics | null = null
  /** What the floor was last drawn for, so it is not redrawn every frame. */
  private floorFor = ''
  private headline: Phaser.GameObjects.Text | null = null
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
    this.timer = this.add.graphics().setDepth(DEPTH_BANNER)
    const middle = this.state.world.width / 2
    this.headline = this.add.text(middle, BANNER_TOP, '', BANNER_STYLE).setOrigin(0.5, 0).setDepth(DEPTH_BANNER)
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
    const result = tick(this.state, Math.min(delta, MAX_STEP_MS))
    if (result.briefs.length > 0) this.options.onBriefs?.(result.briefs)
    this.render()
  }

  private render(): void {
    const list = players(this.state)
    // One read of the objective for the whole frame; four separate ones would
    // rebuild the same snapshot four times over.
    const director = objectives(this.state)
    const seen = new Set<string>()

    for (const player of list) {
      seen.add(player.playerId)
      const view = this.views.get(player.playerId) ?? this.createView(player)
      const alpha = player.away ? AWAY_ALPHA : 1

      view.image.setPosition(player.x, player.y).setAlpha(alpha)
      view.label.setPosition(player.x, player.y - BLOB_SIZE / 2 - NAME_GAP).setAlpha(alpha)
      if (view.label.text !== player.name) view.label.setText(player.name)

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
    this.renderMarks(director.objective)
    this.renderBanner(director.objective)
    this.renderScore(director)
  }

  /**
   * Whatever the task has pinned to particular blobs — the potato, and one day
   * a crown. It is worn in the middle of the blob rather than above it: the
   * space over their heads is already names and speech bubbles, and a child
   * working out who has it should not have to read anything to find out.
   */
  private renderMarks(objective: ObjectiveSnapshot | null): void {
    const worn = new Set<string>()
    for (const mark of objective?.marks ?? []) {
      const player = playerById(this.state, mark.playerId)
      if (!player) continue
      worn.add(mark.playerId)
      const badge = this.marks.get(mark.playerId) ?? this.createMark(mark.playerId)
      if (badge.text !== mark.badge) badge.setText(mark.badge)
      badge.setPosition(player.x, player.y).setAlpha(player.away ? AWAY_ALPHA : 1)
    }
    for (const [playerId, badge] of this.marks) {
      if (worn.has(playerId)) continue
      badge.destroy()
      this.marks.delete(playerId)
    }
  }

  private createMark(playerId: string): Phaser.GameObjects.Text {
    const badge = this.add.text(0, 0, '', MARK_STYLE).setOrigin(0.5, 0.5).setDepth(DEPTH_NAME)
    this.marks.set(playerId, badge)
    return badge
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
    const signature = zones.map(zoneSignature).join('|')
    if (signature === this.floorFor) return
    this.floorFor = signature

    const floor = this.floor
    if (!floor) return
    floor.clear()
    for (const zone of zones) this.drawZone(floor, zone)
  }

  private drawZone(floor: Phaser.GameObjects.Graphics, zone: Zone): void {
    const colour = Phaser.Display.Color.HexStringToColor(zone.colour).color
    floor.fillStyle(colour, ZONE_FILL_ALPHA)
    floor.lineStyle(ZONE_EDGE_WIDTH, colour, 0.9)
    if (zone.shape === 'circle') {
      floor.fillCircle(zone.x, zone.y, zone.radius)
      floor.strokeCircle(zone.x, zone.y, zone.radius)
      return
    }
    const left = zone.x - zone.width / 2
    const top = zone.y - zone.height / 2
    floor.fillRoundedRect(left, top, zone.width, zone.height, 18)
    floor.strokeRoundedRect(left, top, zone.width, zone.height, 18)
  }

  /**
   * What the world is asking for, across the top. It is the same line the
   * phones are told, so a child looking down and a child looking up are reading
   * the same thing.
   */
  private renderBanner(objective: ObjectiveSnapshot | null): void {
    const headline = this.headline
    const detail = this.detail
    if (!headline || !detail) return

    const line = banner(this.state)
    const text = line?.headline ?? ''
    if (headline.text !== text) headline.setText(text)
    headline.setVisible(text.length > 0).setColor(TONE_COLOURS[line?.tone ?? 'task'])

    const under = line?.detail ?? ''
    if (detail.text !== under) detail.setText(under)
    detail.setVisible(text.length > 0 && under.length > 0).setY(headline.y + headline.height)

    this.renderTimer(
      objective,
      detail.visible ? detail.y + detail.height : headline.y + headline.height,
    )
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
    const view: BlobView = { image, label, bubble: null, skinKey: null }
    this.views.set(player.playerId, view)
    return view
  }

  /**
   * A drawing from a phone becomes this blob's texture. `addBase64` decodes the
   * PNG in the background, so the swap waits for the texture manager to say the
   * key is ready.
   */
  private renderSkin(view: BlobView, player: Player): void {
    const skin = player.skin
    if (!skin || view.skinKey === skin.key) return

    const previous = view.skinKey
    view.skinKey = skin.key
    if (this.textures.exists(skin.key)) {
      this.wearSkin(view, skin.key, previous)
      return
    }
    this.textures.once(`addtexture-${skin.key}`, () => this.wearSkin(view, skin.key, previous))
    this.textures.addBase64(skin.key, skin.png)
  }

  private wearSkin(view: BlobView, key: string, previous: string | null): void {
    // A quick second drawing can land while the first is still decoding.
    if (view.skinKey !== key) return
    view.image.setTexture(key).setDisplaySize(BLOB_SIZE, BLOB_SIZE).clearTint()
    if (previous !== key) this.forgetSkin(previous)
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

/** Enough of a zone to tell whether the floor needs redrawing. */
function zoneSignature(zone: Zone): string {
  const size = zone.shape === 'circle' ? zone.radius : `${zone.width}x${zone.height}`
  return `${zone.id}:${zone.shape}:${Math.round(zone.x)}:${Math.round(zone.y)}:${size}:${zone.colour}`
}
