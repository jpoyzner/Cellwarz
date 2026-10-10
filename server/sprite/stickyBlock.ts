import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { getAdjacentSprites } from './adjacent';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

// Grid cells (centre to centre) within which an orange block pushes other orange blocks away, and the push
// (cells/frame²) at point-blank; it fades out linearly with distance. Keeps orange blocks from gathering into big clumps.
const REPEL_RADIUS = 24;
const REPEL_STRENGTH = 0.03;

/**
 * The orange block: sticks to every other block it touches, and the stuck blocks then move as one rigid piece. Orange
 * blocks repel each other, so they tend to spread out instead of all gluing together.
 */
export class StickyBlock extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/sticky/sticky', 1, false, StickyBlock.actionFrames);
  }

  getActionFrames(): Map<string, Frame[]> {
    return StickyBlock.actionFrames;
  }

  protected override dissolvesGroupWhenCarried(): boolean {
    return true;
  }

  protected override onFrame(): void {
    if (this.isBeingHandled()) return;

    this.repelOtherOrangeBlocks();

    for (const sprite of getAdjacentSprites(this)) {
      if (sprite instanceof Mana && !sprite.removed() && this.canBondWith(sprite) && sprite.canBondWith(this)) {
        this.bondWith(sprite);
      }
    }
  }

  private repelOtherOrangeBlocks(): void {
    const group = this.getRigidGroup();
    const centerX = this.getX() + this.getWidth() / 2;
    const centerY = this.getY() + this.getHeight() / 2;

    for (const sprite of this.cellData.getSprites()) {
      if (!(sprite instanceof StickyBlock) || sprite === this || sprite.removed() || sprite.isBeingHandled()) continue;
      if (group.includes(sprite)) continue; // already glued together: they move as one

      const dx = sprite.getX() + sprite.getWidth() / 2 - centerX;
      const dy = sprite.getY() + sprite.getHeight() / 2 - centerY;
      const distance = Math.hypot(dx, dy);
      if (distance >= REPEL_RADIUS) continue;

      // Exactly on top of each other has no direction to push in; split them sideways.
      const push = REPEL_STRENGTH * (1 - distance / REPEL_RADIUS);
      sprite.applyImpulse(distance === 0 ? push : (dx / distance) * push, distance === 0 ? 0 : (dy / distance) * push);
    }
  }
}
