import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Sprite } from './sprite';
import { Avatar } from './avatar';
import type { Thruster } from './thruster';

export const FIRE_ACTION = 'fire';
export const FIRE_WIDTH = 3;
export const FIRE_LENGTH = 6;

// TODO: flames get pushed when jumping under a ledge with engine on it, thus pushing the engine (kept from original Java implementation).
export abstract class EngineFire extends Sprite {
  private readonly mana: Thruster;

  constructor(x: number, y: number, mana: Thruster, cell: Cell) {
    super(x, y, false, cell);
    this.mana = mana;
  }

  protected override getDefaultAction(): string {
    return FIRE_ACTION;
  }

  getLayer(): number {
    return Physics.EFFECTS_LAYER;
  }

  protected override animate(): boolean {
    return true;
  }

  override getAnimationFrequency(): number {
    return Engine.EIGHTH_STEP;
  }

  override melts(): boolean {
    return true;
  }

  burnKill(): void {
    for (const sprite of this.physics.getSpritesAtSamePosition(this)) {
      if (sprite instanceof Avatar && sprite !== this.mana.getStructure()?.getAvatar()) {
        sprite.die();
      }
    }
  }
}
