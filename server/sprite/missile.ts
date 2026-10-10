import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import { EdgeOfCellDataException } from '../errors';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { detonate } from './blast';
import { Explosion } from './explosion';
import { Sprite } from './sprite';
import { Avatar } from './avatar';
import { Mana } from './mana';
import { ShieldBubble } from './shieldBubble';
import { addAction } from './frames';

const FLY_RIGHT_ACTION = 'flyRight';
const FLY_LEFT_ACTION = 'flyLeft';

// Cells per frame²: how fast a launched rocket's flight bends downward (a straight missile has none).
export const ROCKET_GRAVITY = 0.03;
// A rocket that touches a player or anything solid blows up like a smaller red block: avatars inside the kill radius die, blocks inside
// the shove radius fly (grid cells from the rocket).
export const ROCKET_KILL_RADIUS = 10;
export const ROCKET_SHOVE_RADIUS = 20;
// A rocket that hasn't hit anything after this long (5 seconds) is spent.
const MAX_FLIGHT_FRAMES = 240;

export interface MissileLaunch {
  vx: number;
  vy: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rocket. Launched with a velocity it flies in an arc; without one it flies straight in `direction`. */
export class Missile extends Sprite {
  static readonly WIDTH = 2;
  static readonly HEIGHT = 1;

  private static readonly actionFrames = new Map<string, Frame[]>();

  private readonly direction: number;
  private readonly gravity: number;
  private vx: number;
  private vy: number;
  private exactX: number;
  private exactY: number;

  static init(cellData: CellData): void {
    addAction(cellData, FLY_RIGHT_ACTION, 'projectiles/missile', 1, false, Missile.actionFrames);
    addAction(cellData, FLY_LEFT_ACTION, 'projectiles/missile', 1, true, Missile.actionFrames);
    Explosion.init(cellData);
  }

  constructor(x: number, y: number, direction: number, cell: Cell, launch?: MissileLaunch) {
    super(x, y, false, cell);
    this.direction = launch ? Math.sign(launch.vx) || direction : direction;
    this.gravity = launch ? ROCKET_GRAVITY : 0;
    this.vx = launch?.vx ?? direction;
    this.vy = launch?.vy ?? 0;
    this.exactX = x;
    this.exactY = y;
    this.animationSequence = this.getDefaultAction();
  }

  getWidth(): number {
    return Missile.WIDTH;
  }

  getHeight(): number {
    return Missile.HEIGHT;
  }

  getLayer(): number {
    return Physics.EFFECTS_LAYER;
  }

  getActionFrames(): Map<string, Frame[]> {
    return Missile.actionFrames;
  }

  protected override doAction(): void {
    this.vy += this.gravity;
    this.exactX += this.vx;
    this.exactY += this.vy;

    const targetX = Math.round(this.exactX);
    const targetY = Math.round(this.exactY);

    // Unlike avatars, a missile never wraps around a room's edges (CellData would wrap it): it just ends.
    if (!Missile.inBounds(this.cellData, targetX, targetY)) {
      this.removePermanently();
      return;
    }

    const steps = Math.max(Math.abs(targetX - this.getX()), Math.abs(targetY - this.getY()));
    for (let i = 0; i < steps; i++) {
      this.physics.moveTo(this, this.getX() + Math.sign(targetX - this.getX()), this.getY() + Math.sign(targetY - this.getY()));
      if (this.removed() || this.hitSomething()) return;
    }
  }

  /** Returns whether the rocket was used up. A shield bubble swallows it before anything inside can be hurt. */
  private hitSomething(): boolean {
    const touched = this.physics.getSpritesAtSamePosition(this);

    for (const sprite of touched) {
      if (sprite instanceof ShieldBubble && sprite.covers(this.getX() + Missile.WIDTH / 2, this.getY() + Missile.HEIGHT / 2)) {
        this.removePermanently();
        return true;
      }
    }

    // Touching a player or anything solid doesn't hurt by itself: the rocket explodes, and the blast kills (see
    // `detonate`). Robots are flown through (a robot never shoots itself), but a blast still kills them.
    const hit = [...touched].some(
      (sprite) => (sprite instanceof Avatar && !sprite.isRobot() && !sprite.removed()) || Missile.isSolid(sprite),
    );
    if (!hit) return false;

    detonate(this.cell, this.cellData, this.getX() + Missile.WIDTH / 2, this.getY() + Missile.HEIGHT / 2, {
      killRadius: ROCKET_KILL_RADIUS,
      shoveRadius: ROCKET_SHOVE_RADIUS,
      source: this,
    });
    this.removePermanently();
    return true;
  }

  override isEffect(): boolean {
    return true;
  }

  protected override getDefaultAction(): string {
    return this.direction === Physics.RIGHT ? FLY_RIGHT_ACTION : FLY_LEFT_ACTION;
  }

  private static isSolid(sprite: Sprite): boolean {
    return sprite.getLayer() === Physics.LEVEL_LAYER || sprite instanceof Mana;
  }

  private static inBounds(cellData: CellData, x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x + Missile.WIDTH <= cellData.getWidth() && y + Missile.HEIGHT <= cellData.getHeight();
  }

  private static hitsSolid(cellData: CellData, x: number, y: number): boolean {
    for (let column = x; column < x + Missile.WIDTH; column++) {
      try {
        for (const sprite of cellData.getMapPosition(column, y) ?? []) {
          if (Missile.isSolid(sprite)) return true;
        }
      } catch (e) {
        if (!(e instanceof EdgeOfCellDataException)) throw e;
      }
    }

    return false;
  }

  /** Dry-runs a launch from (x, y): whether the arc reaches `target` before leaving the room or hitting a wall or block. */
  static pathReaches(cellData: CellData, x: number, y: number, launch: MissileLaunch, target: Rect): boolean {
    let exactX = x;
    let exactY = y;
    let vy = launch.vy;

    for (let frame = 0; frame < MAX_FLIGHT_FRAMES; frame++) {
      vy += ROCKET_GRAVITY;
      exactX += launch.vx;
      exactY += vy;
      const cellX = Math.round(exactX);
      const cellY = Math.round(exactY);

      if (!Missile.inBounds(cellData, cellX, cellY)) return false;

      const overlaps =
        cellX < target.x + target.width &&
        cellX + Missile.WIDTH > target.x &&
        cellY < target.y + target.height &&
        cellY + Missile.HEIGHT > target.y;
      if (overlaps) return true;
      if (Missile.hitsSolid(cellData, cellX, cellY)) return false;
    }

    return false;
  }
}
