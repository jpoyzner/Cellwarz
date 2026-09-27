import type { CellData } from '../cellData';
import { ClusteredInitException } from '../errors';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Mana } from './mana';
import type { ManaAction } from './manaAction';
import { createManaAction } from './manaAction';
import { Missile } from './missile';
import { DEFAULT_ACTION } from './sprite';
import { addAction, addImage } from './frames';

export class Launcher extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();
  private static dashboardImageIndex: number;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/launcher/launcher', 1, false, Launcher.actionFrames);
    Launcher.dashboardImageIndex = addImage(cellData, 'mana/engine/control');
    Missile.init(cellData); // TODO: make these init methods called once only? (kept from original Java implementation)
  }

  getActionFrames(): Map<string, Frame[]> {
    return Launcher.actionFrames;
  }

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
  }

  protected override addManaActions(): ManaAction[] {
    return [
      createManaAction({
        activate: () => {
          try {
            new Missile(this.getX(), this.getY() + 1, Physics.LEFT, this.cell);
          } catch (e) {
            if (!(e instanceof ClusteredInitException)) throw e;
          }
        },
      }),
      createManaAction({
        activate: () => {
          try {
            new Missile(this.getX(), this.getY() + 1, Physics.RIGHT, this.cell);
          } catch (e) {
            if (!(e instanceof ClusteredInitException)) throw e;
          }
        },
      }),
    ];
  }

  getDashboardImageIndex(): number {
    return Launcher.dashboardImageIndex;
  }
}
