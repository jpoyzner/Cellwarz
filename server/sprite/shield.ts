import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Mana } from './mana';
import { ShieldBubble } from './shieldBubble';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

const BUBBLE_MARGIN = (ShieldBubble.SIZE - Mana.SIZE) / 2;

/** The green block: always wrapped in a big protective bubble that stops rockets and blasts. Otherwise an ordinary block. */
export class Shield extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  private bubble: ShieldBubble | undefined;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/shield/shield', 1, false, Shield.actionFrames);
    ShieldBubble.init(cellData);
  }

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
    this.bubble = this.createBubble();
  }

  getActionFrames(): Map<string, Frame[]> {
    return Shield.actionFrames;
  }

  getBubble(): ShieldBubble | undefined {
    return this.bubble;
  }

  /** Centred on the block, but kept inside the room (a block against an outer wall has its bubble pushed inward). */
  private bubbleSpot(): [number, number] {
    const maxX = this.cellData.getWidth() - ShieldBubble.SIZE;
    const maxY = this.cellData.getHeight() - ShieldBubble.SIZE;
    return [
      Math.max(0, Math.min(maxX, this.getX() - BUBBLE_MARGIN)),
      Math.max(0, Math.min(maxY, this.getY() - BUBBLE_MARGIN)),
    ];
  }

  private createBubble(): ShieldBubble {
    return new ShieldBubble(...this.bubbleSpot(), this.cell);
  }

  protected override onFrame(): void {
    // The bubble can be lost if it was carried off the edge of the room; the block just grows a new one.
    if (!this.bubble || this.bubble.removed()) this.bubble = this.createBubble();

    const [x, y] = this.bubbleSpot();
    if (this.bubble.getX() !== x || this.bubble.getY() !== y) this.physics.moveTo(this.bubble, x, y);
  }

  override removePermanently(): void {
    super.removePermanently();
    this.bubble?.removePermanently();
  }
}
