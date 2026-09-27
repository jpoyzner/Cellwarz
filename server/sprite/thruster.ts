import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Mana } from './mana';
import type { ManaAction } from './manaAction';
import { createManaAction } from './manaAction';
import { EngineFire, FIRE_LENGTH } from './engineFire';
import { EngineFireDown } from './engineFireDown';
import { EngineFireLeft } from './engineFireLeft';
import { EngineFireRight } from './engineFireRight';
import { DEFAULT_ACTION } from './sprite';
import { addAction, addImage } from './frames';

const HORIZONTAL_FLIGHT_STEP = 1;
const VERTICAL_FLIGHT_STEP = 1;

export class Thruster extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();
  private static dashboardImageIndex: number;

  private readonly leftFire: EngineFire;
  private readonly downFire: EngineFire;
  private readonly rightFire: EngineFire;

  private leftThrust = 0;
  private upThrust = 0;
  private rightThrust = 0;

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
    this.leftFire = new EngineFireLeft(x - FIRE_LENGTH, y, this, cell);
    this.leftFire.remove();
    this.downFire = new EngineFireDown(x, y + Mana.SIZE, this, cell);
    this.downFire.remove();
    this.rightFire = new EngineFireRight(x + Mana.SIZE, y, this, cell);
    this.rightFire.remove();
  }

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/engine/engine', 1, false, Thruster.actionFrames);
    Thruster.dashboardImageIndex = addImage(cellData, 'mana/engine/control');
    EngineFireDown.init(cellData);
    EngineFireLeft.init(cellData);
    EngineFireRight.init(cellData);
  }

  protected override addManaActions(): ManaAction[] {
    return [
      createManaAction({
        activate: () => {
          this.leftThrust = 1;
          this.rightFire.replace();
        },
        deactivate: () => {
          this.leftThrust = 0;
          this.rightFire.remove();
        },
      }),
      createManaAction({
        activate: () => {
          this.upThrust = 1;
          this.downFire.replace();
        },
        deactivate: () => {
          this.upThrust = 0;
          this.downFire.remove();
        },
      }),
      createManaAction({
        activate: () => {
          this.rightThrust = 1;
          this.leftFire.replace();
        },
        deactivate: () => {
          this.rightThrust = 0;
          this.leftFire.remove();
        },
      }),
    ];
  }

  protected override doAction(): void {
    let movedVertically = false;

    if (this.upThrust > 0) {
      movedVertically = this.physics.move(this, Physics.NONE, Physics.UP, VERTICAL_FLIGHT_STEP);
    } else {
      this.physics.gravitate(this);
    }

    if (this.physics.move(this, this.rightThrust - this.leftThrust, Physics.NONE, HORIZONTAL_FLIGHT_STEP) || movedVertically) {
      this.physics.moveTo(this.leftFire, this.getX() - FIRE_LENGTH, this.getY());
      this.physics.moveTo(this.downFire, this.getX(), this.getY() + Mana.SIZE);
      this.physics.moveTo(this.rightFire, this.getX() + Mana.SIZE, this.getY());
    }

    if (this.leftThrust === 1) {
      this.leftFire.burnKill();
    }

    if (this.upThrust === 1) {
      this.downFire.burnKill();
    }

    if (this.rightThrust === 1) {
      this.rightFire.burnKill();
    }
  }

  getDashboardImageIndex(): number {
    return Thruster.dashboardImageIndex;
  }

  getActionFrames(): Map<string, Frame[]> {
    return Thruster.actionFrames;
  }
}
