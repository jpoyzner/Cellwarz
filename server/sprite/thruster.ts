import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { getAdjacentSprites } from './adjacent';
import { CellBlock } from './cellBlock';
import { Avatar } from './avatar';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

const REVERSED_ACTION = 'reversed';
// Once active it falls upwards only faintly (a fraction of normal gravity), but whatever touches it — a carrying
// avatar, a block resting against it — is made much lighter (see `lift()` on Avatar and Mana).
const REVERSED_GRAVITY_STRENGTH = 0.15;

/**
 * The yellow block: an ordinary block until an avatar touches or picks it up, after which gravity is reversed for it
 * (faintly), and everything touching it becomes light enough to drift upwards.
 */
export class Thruster extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  private reversed = false;
  // Set once it has bumped a ceiling and fallen back to normal: only being picked up arms it again (an avatar merely
  // standing beside it as it lands would otherwise send it straight back up).
  private spent = false;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/engine/engine', 1, false, Thruster.actionFrames);
    addAction(cellData, REVERSED_ACTION, 'mana/engine/engineUp', 1, false, Thruster.actionFrames);
  }

  getActionFrames(): Map<string, Frame[]> {
    return Thruster.actionFrames;
  }

  isReversed(): boolean {
    return this.reversed;
  }

  override getGravityDirection(): number {
    return this.reversed ? Physics.UP : Physics.DOWN;
  }

  override getGravityStrength(): number {
    return this.reversed ? REVERSED_GRAVITY_STRENGTH : 1;
  }

  protected override onFrame(): void {
    if (!this.reversed) return;

    for (const sprite of getAdjacentSprites(this)) {
      if ((sprite instanceof Avatar || sprite instanceof Mana) && !sprite.removed()) sprite.lift();
    }
  }

  /** Rising into the underside of a wall block (or the room's edge) switches the reversed gravity off; carried blocks never move, so they keep it. */
  protected override onImpact(_wasThrown: boolean, direction: number): void {
    if (!this.reversed || direction !== Physics.UP || this.isBeingHandled()) return;

    const above = this.physics.getSpritesAbove(this, 0, 0);
    if (above.size > 0 && ![...above].some((sprite) => sprite instanceof CellBlock)) return; // only blocks/avatars above it

    this.reversed = false;
    this.spent = true;
    this.setAnimationSequence(DEFAULT_ACTION);
    this.needsRedraw(true);
  }

  protected override onTouched(): void {
    if (this.reversed || (this.spent && !this.isBeingHandled())) return;

    this.spent = false;
    this.reversed = true;
    this.setAnimationSequence(REVERSED_ACTION);
    this.needsRedraw(true);
  }
}
