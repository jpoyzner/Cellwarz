import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { EngineFire, FIRE_ACTION, FIRE_LENGTH, FIRE_WIDTH } from './engineFire';
import type { Thruster } from './thruster';
import { addActions } from './frames';

export class EngineFireRight extends EngineFire {
  private static readonly actionFrames = new Map<string, Frame[]>();

  constructor(x: number, y: number, mana: Thruster, cell: Cell) {
    super(x, y, mana, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return EngineFireRight.actionFrames;
  }

  static init(cellData: CellData): void {
    addActions(cellData, FIRE_ACTION, 'mana/engine/fire/right', 2, EngineFireRight.actionFrames);
  }

  getWidth(): number {
    return FIRE_LENGTH;
  }

  getHeight(): number {
    return FIRE_WIDTH;
  }
}
