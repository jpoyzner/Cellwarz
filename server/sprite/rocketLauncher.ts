import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import type { Avatar } from './avatar';
import { Sprite } from './sprite';
import { addAction } from './frames';

const AIM_RIGHT_ACTION = 'aim_right';
const AIM_LEFT_ACTION = 'aim_left';

/** The rocket launcher a robot pulls out to fire; it follows its owner until the robot puts it away (removes it). */
export class RocketLauncher extends Sprite {
  static readonly WIDTH = 9;
  static readonly HEIGHT = 3;
  /** How far the muzzle sticks out past the owner's side, and how far below the owner's top it sits. */
  static readonly MUZZLE_REACH = 5;
  static readonly MUZZLE_DROP = 2;

  private static readonly actionFrames = new Map<string, Frame[]>();

  private readonly owner: Avatar;
  private facingRight: boolean;

  static init(cellData: CellData): void {
    addAction(cellData, AIM_RIGHT_ACTION, 'weapons/rocketLauncher', 1, false, RocketLauncher.actionFrames);
    addAction(cellData, AIM_LEFT_ACTION, 'weapons/rocketLauncher', 1, true, RocketLauncher.actionFrames);
  }

  constructor(owner: Avatar, facingRight: boolean, cell: Cell) {
    super(...RocketLauncher.positionFor(owner, facingRight), false, cell);
    this.owner = owner;
    this.facingRight = facingRight;
    this.animationSequence = this.getDefaultAction();
  }

  private static positionFor(owner: Avatar, facingRight: boolean): [number, number] {
    const x = facingRight ? owner.getX() + 2 : owner.getX() + owner.getWidth() - 2 - RocketLauncher.WIDTH;
    return [x, owner.getY() + 1];
  }

  /** Where a rocket fired by `owner` starts (just past the muzzle), in grid cells. */
  static muzzleFor(owner: Avatar, facingRight: boolean): [number, number] {
    const x = facingRight ? owner.getX() + owner.getWidth() + RocketLauncher.MUZZLE_REACH : owner.getX() - RocketLauncher.MUZZLE_REACH - 2;
    return [x, owner.getY() + RocketLauncher.MUZZLE_DROP];
  }

  getActionFrames(): Map<string, Frame[]> {
    return RocketLauncher.actionFrames;
  }

  protected override getDefaultAction(): string {
    return this.facingRight ? AIM_RIGHT_ACTION : AIM_LEFT_ACTION;
  }

  getWidth(): number {
    return RocketLauncher.WIDTH;
  }

  getHeight(): number {
    return RocketLauncher.HEIGHT;
  }

  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  override getMass(): number {
    return 0;
  }

  override melts(): boolean {
    return true;
  }

  override isStable(): boolean {
    return true;
  }

  /** Keeps the launcher in the owner's hands, turning with it. */
  follow(facingRight: boolean): void {
    if (facingRight !== this.facingRight) {
      this.facingRight = facingRight;
      this.setAnimationSequence(this.getDefaultAction());
    }

    const [x, y] = RocketLauncher.positionFor(this.owner, this.facingRight);
    if (x !== this.getX() || y !== this.getY()) this.physics.moveTo(this, x, y);
  }
}
