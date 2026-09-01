import Phaser from 'phaser'
import {
  BLOB_SIZE,
  MAX_STEP_MS,
  players,
  tick,
  type GameState,
  type Player,
} from '../game/index.js'
import { WORLD_SCENE_KEY } from './sceneKey.js'

/**
 * The one scene. It renders the model and nothing else: the model moves the
 * blobs (see docs/DECISIONS.md, D-013), so this layer stays thin enough that
 * it needs no tests of its own.
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

/** Blobs at the bottom, names over them, bubbles over everything. */
const DEPTH_BLOB = 0
const DEPTH_NAME = 10
const DEPTH_BUBBLE = 20

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

export class WorldScene extends Phaser.Scene {
  private readonly state: GameState
  private readonly views = new Map<string, BlobView>()
  private waiting: Phaser.GameObjects.Text | null = null

  constructor(state: GameState) {
    super(WORLD_SCENE_KEY)
    this.state = state
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
  }

  override update(_time: number, delta: number): void {
    // A backgrounded tab hands back an enormous delta on its first frame;
    // capping it here is what stops everyone teleporting into a wall.
    tick(this.state, Math.min(delta, MAX_STEP_MS))
    this.render()
  }

  private render(): void {
    const list = players(this.state)
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
