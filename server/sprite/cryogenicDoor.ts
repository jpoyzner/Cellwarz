import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Entrance } from './entrance';
import { addAction } from './frames';

const CLOSED_ACTION = 'closed';
const OPENING_ACTION = 'opening';
const OPEN_ACTION = 'open';
const CLOSING_ACTION = 'closing';

export class CryogenicDoor extends Entrance {
  static readonly WIDTH = 12;
  static readonly HEIGHT = 14;

  private static readonly actionFrames = new Map<string, Frame[]>();

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return CryogenicDoor.actionFrames;
  }

  static init(cellData: CellData): void {
    addAction(cellData, CLOSED_ACTION, 'doors/cryo/closed', 1, false, CryogenicDoor.actionFrames);
    addAction(cellData, OPENING_ACTION, 'doors/cryo/opening', 6, false, CryogenicDoor.actionFrames);
    addAction(cellData, OPEN_ACTION, 'doors/cryo/open', 1, false, CryogenicDoor.actionFrames);
    addAction(cellData, CLOSING_ACTION, 'doors/cryo/closing', 6, false, CryogenicDoor.actionFrames);
  }

  protected override getDefaultAction(): string {
    return CLOSED_ACTION;
  }

  getWidth(): number {
    return CryogenicDoor.WIDTH;
  }

  getHeight(): number {
    return CryogenicDoor.HEIGHT;
  }

  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  protected override animate(): boolean {
    return true;
  }

  override getAnimationFrequency(): number {
    return 12;
  }

  protected getEntranceXOffset(): number {
    return 1;
  }

  protected getEntranceYOffset(): number {
    return 6;
  }

  override getMass(): number {
    return 0;
  }

  override isStable(): boolean {
    return true;
  }
}
