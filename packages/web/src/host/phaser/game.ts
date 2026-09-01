import Phaser from 'phaser'
import type { GameState } from '../game/index.js'
import { WORLD_SCENE_KEY } from './sceneKey.js'
import { WorldScene } from './worldScene.js'

/**
 * Boot Phaser over the model. The canvas is scaled to fit whatever the TV
 * gives us, so the world is always 1280x720 as far as everything else is
 * concerned.
 */
export function startPhaser(parent: HTMLElement, state: GameState): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: state.world.width,
    height: state.world.height,
    backgroundColor: '#1b1f2e',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new WorldScene(state)],
  })
}

/** What each blob is wearing on screen, or `{}` before the scene has started. */
export function wornTextures(game: Phaser.Game): Record<string, string> {
  const scene = game.scene.getScene(WORLD_SCENE_KEY)
  return scene instanceof WorldScene ? scene.wornTextures() : {}
}
