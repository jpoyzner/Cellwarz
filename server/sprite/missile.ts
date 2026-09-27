import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Sprite } from './sprite';
import { Avatar } from './avatar';
import { addAction } from './frames';

const FLY_RIGHT_ACTION = 'flyRight';
const FLY_LEFT_ACTION = 'flyLeft';

export class Missile extends Sprite {
  private static readonly actionFrames = new Map<string, Frame[]>();

  private readonly direction: number;

  static init(cellData: CellData): void {
    addAction(cellData, FLY_RIGHT_ACTION, 'projectiles/missile', 1, false, Missile.actionFrames);
    addAction(cellData, FLY_LEFT_ACTION, 'projectiles/missile', 1, true, Missile.actionFrames);
  }

  constructor(x: number, y: number, direction: number, cell: Cell) {
    super(x, y, false, cell);
    this.direction = direction;
    this.animationSequence = this.getDefaultAction();
  }

  getWidth(): number {
    return 2;
  }

  getHeight(): number {
    return 1;
  }

  getLayer(): number {
    return Physics.EFFECTS_LAYER;
  }

  getActionFrames(): Map<string, Frame[]> {
    return Missile.actionFrames;
  }

  protected override doAction(): void {
    this.physics.move(this, this.direction, Physics.NONE, 1);

    for (const sprite of this.physics.getSpritesAtSamePosition(this)) {
      if (sprite instanceof Avatar) {
        sprite.die();
        this.removePermanently();
      }
    }
  }

  override isEffect(): boolean {
    return true;
  }

  protected override getDefaultAction(): string {
    return this.direction === Physics.RIGHT ? FLY_RIGHT_ACTION : FLY_LEFT_ACTION;
  }
}
