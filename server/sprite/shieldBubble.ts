import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { DEFAULT_ACTION, Sprite } from './sprite';
import { addAction } from './frames';

/** The protective bubble around a green block. It blocks nothing physically; rockets that enter it are destroyed. */
export class ShieldBubble extends Sprite {
  static readonly SIZE = 11;

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
