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
// While an avatar standing on it holds Down it is lowered at this speed (cells per frame) for as long as it is held.
const LOWERED_SPEED = 0.5;
// The avatar re-asserts "Down is held" every frame; the block keeps lowering for this many frames after the last one.
const LOWERING_FRAMES = 3;

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
  private loweringFrames = 0;

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
    return this.reversed && this.loweringFrames === 0 ? Physics.UP : Physics.DOWN;
  }

  override getGravityStrength(): number {
    return this.reversed && this.loweringFrames === 0 ? REVERSED_GRAVITY_STRENGTH : 1;
  }

  protected override onFrame(): void {
    if (this.loweringFrames > 0) {
      this.loweringFrames--;
      // Down was just let go: stop dead rather than coast, so the faint upward pull takes over again from rest.
      this.setVerticalSpeed(this.loweringFrames > 0 ? LOWERED_SPEED : 0);
    }

    if (!this.reversed || this.loweringFrames > 0) return;

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

    this.activate();
  }

  override followRiderUp(): void {
    if (this.reversed && this.loweringFrames === 0 && !this.isBeingHandled()) this.physics.move(this, Physics.NONE, Physics.UP, 1);
  }

  /** An avatar standing right on top of it (free to walk about meanwhile) switches it on even after it has been spent; holding Down lowers it. */
  protected override onStoodOn(pressingDown: boolean): void {
    if (!this.reversed) this.activate();
    if (pressingDown) this.loweringFrames = LOWERING_FRAMES;
  }

  private activate(): void {
    this.spent = false;
    this.reversed = true;
    this.setAnimationSequence(REVERSED_ACTION);
    this.needsRedraw(true);
  }
}
