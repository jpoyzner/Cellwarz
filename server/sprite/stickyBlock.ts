import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { getAdjacentSprites } from './adjacent';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

/** The orange block: sticks to every other block it touches, and the stuck blocks then move as one rigid piece. */
export class StickyBlock extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/sticky/sticky', 1, false, StickyBlock.actionFrames);
  }

  getActionFrames(): Map<string, Frame[]> {
    return StickyBlock.actionFrames;
  }

  protected override onFrame(): void {
    if (this.isBeingHandled()) return;

    for (const sprite of getAdjacentSprites(this)) {
      if (sprite instanceof Mana && !sprite.removed() && this.canBondWith(sprite) && sprite.canBondWith(this)) {
        this.bondWith(sprite);
      }
    }
  }
}
