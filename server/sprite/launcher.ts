import type { CellData } from '../cellData';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { detonate } from './blast';
import { Explosion } from './explosion';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

const ARMED_ACTION = 'armed';
export const FUSE_FRAMES = 5 * Engine.EVERY_SECOND;
// Grid-cell distances from the block's centre: avatars inside the kill radius die, blocks inside the shove radius fly.
export const KILL_RADIUS = 28;
export const SHOVE_RADIUS = 30;

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
    detonate(this.cell, this.cellData, this.getX() + this.getWidth() / 2, this.getY() + this.getHeight() / 2, {
      killRadius: KILL_RADIUS,
      shoveRadius: SHOVE_RADIUS,
      source: this,
    });
    this.removePermanently();
  }
}
