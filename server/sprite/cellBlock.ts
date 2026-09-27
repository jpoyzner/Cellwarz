import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { DEFAULT_ACTION, Sprite } from './sprite';
import { addAction } from './frames';

export class CellBlock extends Sprite {
  static readonly SIZE = 2;

  private static readonly actionFrames = new Map<string, Frame[]>();

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return CellBlock.actionFrames;
  }

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'blocks/blockC', 1, false, CellBlock.actionFrames);
  }

  getWidth(): number {
    return CellBlock.SIZE;
  }

  getHeight(): number {
    return CellBlock.SIZE;
  }

  getLayer(): number {
    return Physics.LEVEL_LAYER;
  }

  override getMass(): number {
    return 10;
  }

  override isStable(): boolean {
    return true;
  }
}
