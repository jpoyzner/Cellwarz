import type { CellData } from '../cellData';
import { EdgeOfCellDataException } from '../errors';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Avatar } from './avatar';
import { Explosion } from './explosion';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

const ARMED_ACTION = 'armed';
export const FUSE_FRAMES = 5 * Engine.EVERY_SECOND;
// Grid-cell distances from the block's centre: avatars inside the kill radius die, blocks inside the shove radius fly.
export const KILL_RADIUS = 14;
export const SHOVE_RADIUS = 30;
const SHOVE_MIN_SPEED = 0.8;
const SHOVE_EXTRA_SPEED = 1.6;
const SHOVE_LIFT = 0.8;

/** The red block: once an avatar touches or picks it up, a five second fuse burns down and it blows up. */
export class Launcher extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  private fuseFrames = 0;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/launcher/launcher', 1, false, Launcher.actionFrames);
    addAction(cellData, ARMED_ACTION, 'mana/launcher/armed', 2, false, Launcher.actionFrames);
    Explosion.init(cellData);
  }

  getActionFrames(): Map<string, Frame[]> {
    return Launcher.actionFrames;
  }

  isArmed(): boolean {
    return this.fuseFrames > 0;
  }

  /** Frames left before it blows up (0 when the fuse isn't lit). */
  getFuseFrames(): number {
    return this.fuseFrames;
  }

  protected override onTouched(): void {
    if (this.isArmed()) return;

    this.fuseFrames = FUSE_FRAMES;
    this.setAnimationSequence(ARMED_ACTION);
    this.needsRedraw(true);
  }

  protected override animate(): boolean {
    return this.isArmed();
  }

  // The closer to blowing up, the faster it flashes.
  override getAnimationFrequency(): number {
    if (this.fuseFrames > Engine.EVERY_SECOND * 3) return Engine.EIGHTH_STEP;
    if (this.fuseFrames > Engine.EVERY_SECOND) return Engine.QUARTER_STEP;
    return Engine.HALF_STEP;
  }

  protected override onFrame(): void {
    if (!this.isArmed()) return;

    this.fuseFrames--;
    if (this.fuseFrames === 0) this.explode();
  }

  private explode(): void {
    const centerX = this.getX() + this.getWidth() / 2;
    const centerY = this.getY() + this.getHeight() / 2;

    for (const sprite of this.cellData.getSprites()) {
      if (sprite === this || sprite.removed()) continue;

      const dx = sprite.getX() + sprite.getWidth() / 2 - centerX;
      const dy = sprite.getY() + sprite.getHeight() / 2 - centerY;
      const distance = Math.hypot(dx, dy);

      if (sprite instanceof Avatar) {
        if (distance <= KILL_RADIUS && this.canReach(centerX, centerY, sprite)) {
          sprite.die(Math.sign(dx), Physics.UP);
        }
      } else if (sprite instanceof Mana && distance <= SHOVE_RADIUS) {
        const speed = SHOVE_MIN_SPEED + SHOVE_EXTRA_SPEED * (1 - distance / SHOVE_RADIUS);
        const awayX = distance === 0 ? 0 : dx / distance;
        const awayY = distance === 0 ? -1 : dy / distance;
        sprite.applyImpulse(awayX * speed, awayY * speed - SHOVE_LIFT);
      }
    }

    this.showExplosion(centerX, centerY);
    this.removePermanently();
  }

  /** The blast reaches an avatar if it has a clear line to any of its head, middle or feet (a ledge can't shield all three). */
  private canReach(fromX: number, fromY: number, avatar: Avatar): boolean {
    const x = avatar.getX() + avatar.getWidth() / 2;
    const top = avatar.getY();
    const height = avatar.getHeight();
    return [top + 1, top + height / 2, top + height - 1].some((y) => this.hasClearLine(fromX, fromY, x, y));
  }

  /** The blast doesn't reach through level walls: false if one lies on the straight line between the two points. */
  private hasClearLine(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const steps = Math.ceil(Math.hypot(toX - fromX, toY - fromY));

    for (let i = 1; i < steps; i++) {
      const x = Math.floor(fromX + ((toX - fromX) * i) / steps);
      const y = Math.floor(fromY + ((toY - fromY) * i) / steps);

      try {
        for (const sprite of this.cellData.getMapPosition(x, y) ?? []) {
          if (sprite.getLayer() === Physics.LEVEL_LAYER) return false;
        }
      } catch (e) {
        if (!(e instanceof EdgeOfCellDataException)) throw e;
      }
    }

    return true;
  }

  private showExplosion(centerX: number, centerY: number): void {
    const half = Explosion.SIZE / 2;
    const x = Math.max(0, Math.min(this.cellData.getWidth() - Explosion.SIZE, Math.round(centerX - half)));
    const y = Math.max(0, Math.min(this.cellData.getHeight() - Explosion.SIZE, Math.round(centerY - half)));
    new Explosion(x, y, this.cell);
  }
}
