import type { CellData } from '../cellData';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Diamond } from './diamond';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

const FRAME_COUNT = 6;
export const DIAMONDS_PER_BLOCK = 5;
const DIAMOND_SPREAD = 0.9;
const DIAMOND_LIFT = 0.9;

// Headings, clockwise: right, down, left, up.
const HEADINGS: ReadonlyArray<readonly [number, number]> = [
  [Physics.RIGHT, Physics.NONE],
  [Physics.NONE, Physics.DOWN],
  [Physics.LEFT, Physics.NONE],
  [Physics.NONE, Physics.UP],
];

/**
 * The rainbow block: ignores gravity and crawls constantly, picking a random heading and — once something is in
 * its way — hugging that object's edge (walls, other blocks, even avatars), around corners and up walls. Thrown, it
 * flies like any block and shatters on impact into collectible diamonds.
 */
export class RainbowBlock extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  private heading = Math.floor(Math.random() * HEADINGS.length);
  /** Whether it is currently following an object kept on its right-hand side. */
  private hugging = false;
  /** Crawl steps in a row that ended touching nothing: one is normal at an outside corner, two means the wall is gone. */
  private untouchedSteps = 0;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/rainbow/rainbow', FRAME_COUNT, false, RainbowBlock.actionFrames);
    Diamond.init(cellData);
  }

  getActionFrames(): Map<string, Frame[]> {
    return RainbowBlock.actionFrames;
  }

  getHeading(): number {
    return this.heading;
  }

  protected override animate(): boolean {
    return true;
  }

  override getAnimationFrequency(): number {
    return Engine.EIGHTH_STEP;
  }

  // It only clings to walls: thrown, or with nothing touching it at all (and no wall being followed), it drops.
  override getGravityDirection(): number {
    if (this.isThrown()) return Physics.DOWN;
    if (this.isBeingHandled() || this.hugging) return Physics.NONE;
    return this.isTouchingAnything() ? Physics.NONE : Physics.DOWN;
  }

  override isAffectedByPlanets(): boolean {
    return false;
  }

  protected override acceptsImpulses(): boolean {
    return this.isThrown();
  }

  // Sticking it to something would drag the whole piece along its crawl.
  override canBondWith(): boolean {
    return false;
  }

  protected override onFrame(): void {
    if (this.isBeingHandled() || this.isThrown()) {
      this.hugging = false; // whatever it was following is behind it now
      this.untouchedSteps = 0;
      return;
    }
    if (this.engine.actionMatchesFrequency(Engine.HALF_STEP)) this.crawl();
  }

  protected override onImpact(wasThrown: boolean): void {
    if (wasThrown) this.shatter();
  }

  private isTouchingAnything(): boolean {
    return HEADINGS.some((_, heading) => this.isBlocked(heading));
  }

  private isBlocked(heading: number): boolean {
    const [dx, dy] = HEADINGS[heading];
    return this.physics.touchSprite(this, dx, dy, false);
  }

  /**
   * Right-hand wall following: while hugging, the object on the right is kept on the right — straight on while it
   * lasts, left at an inside corner, and right (around its edge) the moment it runs out, so it never drifts off into
   * open space. Not yet hugging, it heads straight until it meets something, then turns to put that on its right.
   * If the wall disappears altogether it stops hugging, and with nothing touching it, it drops (see getGravityDirection).
   */
  private crawl(): void {
    const right = (this.heading + 1) % HEADINGS.length;
    const left = (this.heading + HEADINGS.length - 1) % HEADINGS.length;
    const back = (this.heading + 2) % HEADINGS.length;

    if (!this.hugging) {
      if (this.isBlocked(this.heading) && !this.isBlocked(right)) {
        this.heading = left;
        this.hugging = true;
        return;
      }
      if (this.isBlocked(right)) this.hugging = true;
      else if (this.isBlocked(left)) { this.heading = back; this.hugging = true; return; }
      else if (this.isBlocked(back)) { this.heading = right; this.hugging = true; return; }
    }

    if (this.hugging) {
      if (!this.isBlocked(right)) this.heading = right;
      else if (this.isBlocked(this.heading)) {
        this.heading = left;
        return;
      }
    }

    const [dx, dy] = HEADINGS[this.heading];
    const moved = this.physics.move(this, dx, dy, 1, false);

    if (!this.hugging) return;
    if (moved && !this.isTouchingAnything()) this.untouchedSteps++;
    else this.untouchedSteps = 0;
    if (this.untouchedSteps > 1) {
      this.hugging = false;
      this.untouchedSteps = 0;
    }
  }

  private shatter(): void {
    const x = Math.round(this.getX() + (this.getWidth() - Diamond.SIZE) / 2);
    const y = Math.round(this.getY() + (this.getHeight() - Diamond.SIZE) / 2);

    for (let i = 0; i < DIAMONDS_PER_BLOCK; i++) {
      const spread = (i / (DIAMONDS_PER_BLOCK - 1)) * 2 - 1;
      new Diamond(x, y, spread * DIAMOND_SPREAD, -DIAMOND_LIFT - Math.random() * 0.4, this.cell);
    }

    this.removePermanently();
  }
}
