import type { World } from '../world';
import { Cell } from './cell';

export class SimpleSmallCell extends Cell {
  constructor(world: World) {
    super(world);
  }

  getMinCellWidth(): number {
    return 800;
  }

  getMinCellHeight(): number {
    return 800;
  }

  usePortal(): boolean {
    return true;
  }

  getNumBoosters(): number {
    return 5;
  }

  getNumLaunchers(): number {
    return 10;
  }

  getNumIce(): number {
    return 1;
  }

  getNumRobots(): number {
    return 0;
  }
}
