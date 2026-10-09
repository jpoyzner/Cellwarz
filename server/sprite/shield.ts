import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Mana } from './mana';
import { ShieldBubble } from './shieldBubble';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

const BUBBLE_MARGIN = (ShieldBubble.SIZE - Mana.SIZE) / 2;

/** The green block: always wrapped in a protective bubble that stops rockets. Otherwise an ordinary block. */
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

  private createBubble(): ShieldBubble {
    return new ShieldBubble(this.getX() - BUBBLE_MARGIN, this.getY() - BUBBLE_MARGIN, this.cell);
  }

  protected override onFrame(): void {
    // The bubble can be lost if it was carried off the edge of the room; the block just grows a new one.
    if (!this.bubble || this.bubble.removed()) this.bubble = this.createBubble();

    const x = this.getX() - BUBBLE_MARGIN;
    const y = this.getY() - BUBBLE_MARGIN;
    if (this.bubble.getX() !== x || this.bubble.getY() !== y) this.physics.moveTo(this.bubble, x, y);
  }

  override removePermanently(): void {
    super.removePermanently();
    this.bubble?.removePermanently();
  }
}
