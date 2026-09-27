import type { Cell } from '../cell/cell';
import { Sprite } from './sprite';

export abstract class Entrance extends Sprite {
  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
  }

  getEntranceX(): number {
    return this.getX() + this.getEntranceXOffset();
  }

  getEntranceY(): number {
    return this.getY() + this.getEntranceYOffset();
  }

  protected abstract getEntranceXOffset(): number;
  protected abstract getEntranceYOffset(): number;
}
