import Phaser from 'phaser'
import type { GameState } from '../game/index.js'
import { WORLD_SCENE_KEY } from './sceneKey.js'
import { WorldScene, type SceneOptions } from './worldScene.js'

export type { SceneOptions }

/** The socket lives in `main.ts`, so anything the world says to a phone leaves through `options`. */
export function startPhaser(
  parent: HTMLElement,
  state: GameState,
  options: SceneOptions = {},
): Phaser.Game {
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
    scene: [new WorldScene(state, options)],
  })
}

/** `{}` before the scene has started. */
export function wornTextures(game: Phaser.Game): Record<string, string> {
  const scene = game.scene.getScene(WORLD_SCENE_KEY)
  return scene instanceof WorldScene ? scene.wornTextures() : {}
}
