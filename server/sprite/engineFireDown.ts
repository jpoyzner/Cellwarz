import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { EngineFire, FIRE_ACTION, FIRE_LENGTH, FIRE_WIDTH } from './engineFire';
import type { Thruster } from './thruster';
import { addActions } from './frames';

export class EngineFireDown extends EngineFire {
  private static readonly actionFrames = new Map<string, Frame[]>();

  constructor(x: number, y: number, mana: Thruster, cell: Cell) {
    super(x, y, mana, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return EngineFireDown.actionFrames;
  }

  static init(cellData: CellData): void {
    addActions(cellData, FIRE_ACTION, 'mana/engine/fire/down', 2, EngineFireDown.actionFrames);
  }

  getWidth(): number {
    return FIRE_WIDTH;
  }

  getHeight(): number {
    return FIRE_LENGTH;
  }
}
