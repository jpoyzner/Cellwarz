import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { DEFAULT_ACTION, Sprite } from './sprite';
import { addAction } from './frames';

/**
 * The big protective bubble around a green block. It blocks nothing physically; rockets that enter it are destroyed
 * and anyone inside it is safe from blasts (see Launcher). The art is a circle filling the sprite's square.
 */
export class ShieldBubble extends Sprite {
  static readonly SIZE = 31;

  private static readonly actionFrames = new Map<string, Frame[]>();

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'effects/bubble', 1, false, ShieldBubble.actionFrames);
  }

  constructor(x: number, y: number, cell: Cell) {
    super(x, y, false, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return ShieldBubble.actionFrames;
  }

  getWidth(): number {
    return ShieldBubble.SIZE;
  }

  getHeight(): number {
    return ShieldBubble.SIZE;
  }

  /** Whether the point (grid cells) is inside the round bubble, not merely inside its bounding square. */
  covers(x: number, y: number): boolean {
    const radius = ShieldBubble.SIZE / 2;
    return Math.hypot(x - (this.getX() + radius), y - (this.getY() + radius)) <= radius;
  }

  /** Whether any live bubble in the room covers the point. */
  static isCovered(cellData: CellData, x: number, y: number): boolean {
    return cellData.getSprites().some((sprite) => sprite instanceof ShieldBubble && !sprite.removed() && sprite.covers(x, y));
  }

  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  override getMass(): number {
    return 0;
  }

  override melts(): boolean {
    return true;
  }

  override isStable(): boolean {
    return true;
  }
}
