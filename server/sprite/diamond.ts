import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Avatar } from './avatar';
import { DEFAULT_ACTION, Sprite } from './sprite';
import { addAction } from './frames';

const GRAVITY = 0.1;
const MAX_FALL_SPEED = 3;
const RESTITUTION = 0.45;
const MIN_REBOUND_SPEED = 0.5;
const GROUND_FRICTION = 0.85;
const WALL_RESTITUTION = 0.5;

/** A blue diamond a broken rainbow block leaves behind; the first player to touch it collects it. */
export class Diamond extends Sprite {
  static readonly SIZE = 2;

  private static readonly actionFrames = new Map<string, Frame[]>();

  private vx: number;
  private vy: number;
  private subX = 0;
  private subY = 0;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'effects/diamond', 1, false, Diamond.actionFrames);
  }

  constructor(x: number, y: number, vx: number, vy: number, cell: Cell) {
    super(x, y, false, cell);
    this.vx = vx;
    this.vy = vy;
  }

  getActionFrames(): Map<string, Frame[]> {
    return Diamond.actionFrames;
  }

  getWidth(): number {
    return Diamond.SIZE;
  }

  getHeight(): number {
    return Diamond.SIZE;
  }

  // On the layer nothing else collides with, but it still lands on walls and blocks when it moves itself.
  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  override melts(): boolean {
    return true;
  }

  protected override doAction(): void {
    this.fall();
    this.slide();
    if (!this.removed()) this.collect();
  }

  private fall(): void {
    const grounded = this.physics.touchSprite(this, Physics.NONE, Physics.DOWN, false);

    if (grounded && this.vy > 0) {
      this.vy = this.vy * RESTITUTION >= MIN_REBOUND_SPEED ? -this.vy * RESTITUTION : 0;
      this.subY = 0;
      this.vx *= GROUND_FRICTION;
    } else if (grounded && this.vy === 0) {
      this.vx *= GROUND_FRICTION;
    } else {
      this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY);
    }

    this.subY += this.vy;
    const rows = Math.trunc(this.subY);
    this.subY -= rows;

    for (let i = 0; i < Math.abs(rows); i++) {
      if (!this.physics.move(this, Physics.NONE, Math.sign(rows), 1, false)) {
        const rebound = Math.abs(this.vy) * RESTITUTION;
        this.vy = Math.sign(rows) === Physics.DOWN && rebound >= MIN_REBOUND_SPEED ? -rebound : 0;
        this.subY = 0;
        return;
      }
    }
  }

  private slide(): void {
    if (Math.abs(this.vx) < 0.04) this.vx = 0;

    this.subX += this.vx;
    const columns = Math.trunc(this.subX);
    this.subX -= columns;

    for (let i = 0; i < Math.abs(columns); i++) {
      if (!this.physics.move(this, Math.sign(columns), Physics.NONE, 1, false)) {
        this.vx *= -WALL_RESTITUTION;
        this.subX = 0;
        return;
      }
    }
  }

  private collect(): void {
    for (const sprite of this.physics.getSpritesAtSamePosition(this)) {
      if (!(sprite instanceof Avatar) || sprite.isRobot() || sprite.removed()) continue;

      const session = sprite.getSession();
      if (!session) continue;

      session.addDiamonds(1);
      this.removePermanently();
      return;
    }
  }
}
