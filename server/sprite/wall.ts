import { ClusteredInitException } from '../errors';
import type { Cell } from '../cell/cell';
import { CellBlock } from './cellBlock';

export class Wall {
  constructor(vertical: boolean, startX: number, startY: number, length: number, cell: Cell) {
    let x = startX;
    let y = startY;

    for (let i = 0; i < length; i++) {
      try {
        new CellBlock(x, y, false, cell);
      } catch (e) {
        if (!(e instanceof ClusteredInitException)) throw e;
      }

      if (vertical) {
        y += CellBlock.SIZE;
      } else {
        x += CellBlock.SIZE;
      }
    }
  }
}
