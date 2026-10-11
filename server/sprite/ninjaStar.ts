import type { Cell } from '../cell/cell';
import { CellData } from '../cellData';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Avatar, HIT_DAMAGE_PERCENT } from './avatar';
import { detonate } from './blast';
import { addAction } from './frames';
import { Explosion } from './explosion';
import { Mana } from './mana';
import { ShieldBubble } from './shieldBubble';
import { Sprite } from './sprite';

const SPIN_ACTION = 'spin';
const SPIN_FRAMES = 4;

// Cells per frame: fast, with only a slight downward curve (STAR_GRAVITY) on top of any planet's pull.
export const STAR_SPEED = 1.5;
// Cells per frame², far gentler than a rocket's: a full-length flight (72 frames) sinks about 15 cells, a short one barely a couple.
export const STAR_GRAVITY = 0.006;
// A star that hasn't hit anything after this long (1.5 seconds, about 100 cells) is spent.
const MAX_FLIGHT_FRAMES = 72;
// Like a rocket's blast, only smaller: avatars inside the kill radius lose a fifth of their health, blocks inside the shove radius fly.
export const STAR_KILL_RADIUS = 6;
export const STAR_SHOVE_RADIUS = 12;

/** A thrown ninja star: spins ahead on a slightly drooping arc and explodes (small) on the first player, robot or solid thing it touches. */
export class NinjaStar extends Sprite {
  static readonly SIZE = 3;

  private static readonly actionFrames = new Map<string, Frame[]>();

  private readonly thrower: Avatar;
  private vx: number;
  private vy = 0;
  private exactX: number;
  private exactY: number;
  private age = 0;

  static init(cellData: CellData): void {
    addAction(cellData, SPIN_ACTION, 'projectiles/star', SPIN_FRAMES, false, NinjaStar.actionFrames);
    Explosion.init(cellData);
  }

  constructor(x: number, y: number, direction: number, thrower: Avatar, cell: Cell) {
    super(x, y, false, cell);
    this.thrower = thrower;
    this.vx = direction * STAR_SPEED;
    this.exactX = x;
    this.exactY = y;
  }

  getWidth(): number {
    return NinjaStar.SIZE;
  }

  getHeight(): number {
    return NinjaStar.SIZE;
  }

  getLayer(): number {
    return Physics.EFFECTS_LAYER;
  }

  getActionFrames(): Map<string, Frame[]> {
    return NinjaStar.actionFrames;
  }

  override isEffect(): boolean {
    return true;
  }

  protected override getDefaultAction(): string {
    return SPIN_ACTION;
  }

  protected override animate(): boolean {
    return true;
  }

  override getAnimationFrequency(): number {
    return Engine.HALF_STEP;
  }

  protected override doAction(): void {
    this.age++;
    const step = CellData.ANIMATION_STEP;
    const pull = this.cell.getProjectilePlanetAcceleration(
      (this.exactX + NinjaStar.SIZE / 2) * step,
      (this.exactY + NinjaStar.SIZE / 2) * step,
    );
    this.vx += pull.x;
    this.vy += pull.y + STAR_GRAVITY;
    this.exactX += this.vx;
    this.exactY += this.vy;
    const targetX = Math.round(this.exactX);
    const targetY = Math.round(this.exactY);

    // Like a rocket, a star never wraps around a room's edges: it just ends.
    if (
      this.age > MAX_FLIGHT_FRAMES ||
      targetX < 0 ||
      targetY < 0 ||
      targetX + NinjaStar.SIZE > this.cellData.getWidth() ||
      targetY + NinjaStar.SIZE > this.cellData.getHeight()
    ) {
      this.removePermanently();
      return;
    }

    while (this.getX() !== targetX || this.getY() !== targetY) {
      this.physics.moveTo(
        this,
        this.getX() + Math.sign(targetX - this.getX()),
        this.getY() + Math.sign(targetY - this.getY()),
      );
      if (this.removed() || this.hitSomething()) return;
    }
  }

  /** Returns whether the star was used up. A shield bubble swallows it before anything inside can be hurt. */
  private hitSomething(): boolean {
    const touched = this.physics.getSpritesAtSamePosition(this);
    const centerX = this.getX() + NinjaStar.SIZE / 2;
    const centerY = this.getY() + NinjaStar.SIZE / 2;

    for (const sprite of touched) {
      if (sprite instanceof ShieldBubble && sprite.covers(centerX, centerY)) {
        this.removePermanently();
        return true;
      }
    }

    const hit = [...touched].some(
      (sprite) =>
        (sprite instanceof Avatar && sprite !== this.thrower && !sprite.removed()) ||
        sprite.getLayer() === Physics.LEVEL_LAYER ||
        sprite instanceof Mana,
    );
    if (!hit) return false;

    detonate(this.cell, this.cellData, centerX, centerY, {
      killRadius: STAR_KILL_RADIUS,
      shoveRadius: STAR_SHOVE_RADIUS,
      damage: HIT_DAMAGE_PERCENT,
      small: true,
      source: this,
    });
    this.removePermanently();
    return true;
  }
}
