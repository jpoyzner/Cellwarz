import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Mana } from './mana';
import type { ManaAction } from './manaAction';
import { DEFAULT_ACTION } from './sprite';
import { addAction, addImage } from './frames';

const SLIDE_STEP_DISTANCE = 1;

export class Ice extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();
  private static dashboardImageIndex: number;

  private slidePower: number;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/ice/ice', 1, false, Ice.actionFrames);
    Ice.dashboardImageIndex = addImage(cellData, 'mana/engine/control');
  }

  getActionFrames(): Map<string, Frame[]> {
    return Ice.actionFrames;
  }

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
    this.slidePower = Physics.RIGHT;
  }

  protected override addManaActions(): ManaAction[] {
    return [];
  }

  getDashboardImageIndex(): number {
    return Ice.dashboardImageIndex;
  }

  protected override doAction(): void {
    this.physics.gravitate(this);

    if (this.engine.actionMatchesFrequency(Engine.HALF_STEP)) {
      if (!this.physics.move(this, this.slidePower, Physics.NONE, SLIDE_STEP_DISTANCE)) {
        this.slidePower *= -1;
      }
    }
  }
}
