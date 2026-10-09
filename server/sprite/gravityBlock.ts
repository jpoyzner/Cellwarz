import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

// Grid cells from this block's centre within which it pulls other blocks, and the pull (cells/frame²) at point-blank.
export const PULL_RADIUS = 36;
const PULL_STRENGTH = 0.03;
// Blocks already touching it aren't pulled any harder (they'd just jitter).
const SETTLED_DISTANCE = Mana.SIZE + 0.5;

/** The purple block: pulls every other block toward itself (harder the closer they are), otherwise an ordinary block. */
export class GravityBlock extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/gravity/gravity', 1, false, GravityBlock.actionFrames);
  }

  getActionFrames(): Map<string, Frame[]> {
    return GravityBlock.actionFrames;
  }

  protected override onFrame(): void {
    const centerX = this.getX() + this.getWidth() / 2;
    const centerY = this.getY() + this.getHeight() / 2;

    for (const sprite of this.cellData.getSprites()) {
      if (!(sprite instanceof Mana) || sprite === this || sprite.removed() || sprite.isBeingHandled()) continue;

      const dx = centerX - (sprite.getX() + sprite.getWidth() / 2);
      const dy = centerY - (sprite.getY() + sprite.getHeight() / 2);
      const distance = Math.hypot(dx, dy);
      if (distance <= SETTLED_DISTANCE || distance >= PULL_RADIUS) continue;

      const pull = PULL_STRENGTH * (1 - distance / PULL_RADIUS);
      sprite.applyImpulse((dx / distance) * pull, (dy / distance) * pull);
    }
  }
}
