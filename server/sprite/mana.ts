import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Sprite } from './sprite';
import { ManaBody } from './manaBody';

// Cell-space physics (cells per frame, per frame²). Blocks are light: avatars can shove them, they slide a little
// and stop, and they bounce off whatever they land on — harder the farther they fell.
const GRAVITY = 0.1;
const MAX_SPEED = 3;
const LANDING_RESTITUTION = 0.5;
// A landing that would rebound slower than this just settles instead of hopping forever.
const MIN_REBOUND_SPEED = 0.55;
const WALL_RESTITUTION = 0.3;
const GROUND_FRICTION = 0.9;
const AIR_DRAG = 0.995;
const MIN_SLIDE_SPEED = 0.003;
// What an avatar's shove gives a block, per direction (a block pushed up gets launched a little).
const PUSH_SPEED = 0.5;
const PUSH_LAUNCH_SPEED = 1;
// A block touching an active yellow one is "lifted": for this many frames after each touch it feels a faint upward
// pull (as a fraction of normal gravity) instead of its own gravity.
const LIFT_FRAMES = 3;
const LIFT_PULL = 0.3;

export abstract class Mana extends Sprite {
  static readonly SIZE = 3;

  private body: ManaBody;
  private handlingMelt = false;
  private handledFlag = false;
  private thrownFlag = false;
  private liftedFrames = 0;

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
    this.body = new ManaBody(this);
  }

  getWidth(): number {
    return Mana.SIZE;
  }

  getHeight(): number {
    return Mana.SIZE;
  }

  getLayer(): number {
    return Physics.OBJECT_LAYER;
  }

  protected override doAction(): void {
    if (this.liftedFrames > 0) this.liftedFrames--;
    this.body.prune();
    this.onFrame();

    if (this.handledFlag) {
      this.body.stop();
      return;
    }

    if (this.body.getLeader() === this) {
      this.stepMotion();
    }
  }

  /** Per-frame hook for a block's own behavior (runs even while it is being carried). */
  protected onFrame(): void {}

  /** Which way gravity pulls this block: `Physics.DOWN` normally, `Physics.UP` or `Physics.NONE` for special ones. */
  getGravityDirection(): number {
    return Physics.DOWN;
  }

  /** How strong this block's gravity is, as a fraction of normal (the yellow block's is faint once active). */
  getGravityStrength(): number {
    return 1;
  }

  /** Signed gravity this block feels (+ down, - up), as a fraction of normal; lifted blocks feel a faint upward pull. */
  getGravityPull(): number {
    if (this.liftedFrames > 0) return -LIFT_PULL;
    return this.getGravityDirection() * this.getGravityStrength();
  }

  /** An active yellow block is touching this one: it gets much lighter for a few frames (see `LIFT_PULL`). */
  lift(): void {
    if (this.handledFlag || !this.acceptsImpulses()) return;
    this.liftedFrames = LIFT_FRAMES;
  }

  /** A constant sliding speed (cells per frame, signed) the block keeps up while resting on something; 0 for none. */
  getSlideDrive(): number {
    return 0;
  }

  /** Called when a block that is driven along the ground runs into something it can't push; may change the drive. */
  protected onSlideBlocked(): void {}

  /** Whether shoves, explosions and pulls change this block's motion. */
  protected acceptsImpulses(): boolean {
    return true;
  }

  /** Whether orange blocks may stick to this one. */
  canBondWith(_other: Mana): boolean {
    return true;
  }

  /**
   * Called when the block lands on or runs into something; `wasThrown` is true for the first hit after a throw, and
   * `direction` is the vertical direction it hit in (`Physics.UP` for a ceiling, `Physics.NONE` for a sideways hit).
   */
  protected onImpact(_wasThrown: boolean, _direction: number): void {}

  /** Called the moment an avatar touches the block (stands against it, or picks it up). */
  protected onTouched(): void {}

  touch(): void {
    this.onTouched();
  }

  private stepMotion(): void {
    const body = this.body;
    const gravity = body.gravityDirection();
    const gravityStrength = body.gravityStrength();
    const drive = body.slideDrive();
    const grounded = gravity !== 0 && body.members.some((member) => this.physics.touchSprite(member, Physics.NONE, gravity, false));

    if (gravity !== 0) {
      if (grounded && body.vy * gravity > 0) {
        // Arrived on something this frame (the last step of the fall ended exactly in contact).
        this.hitVertically(body, gravity, gravity);
      } else if (grounded && body.vy * gravity === 0) {
        body.subY = 0;
      } else {
        body.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, body.vy + gravity * gravityStrength * GRAVITY));
      }
    } else {
      body.vy *= AIR_DRAG;
      if (Math.abs(body.vy) < MIN_SLIDE_SPEED) body.vy = 0;
    }

    body.vx *= grounded ? GROUND_FRICTION : AIR_DRAG;
    if (drive !== 0 && grounded) body.vx = drive;
    if (Math.abs(body.vx) < MIN_SLIDE_SPEED) body.vx = 0;

    this.moveAlongY(body, gravity);
    if (!this.removed()) this.moveAlongX(body, drive, grounded);
  }

  private moveAlongY(body: ManaBody, gravity: number): void {
    body.subY += body.vy;
    const rows = Math.trunc(body.subY);
    body.subY -= rows;

    for (let i = 0; i < Math.abs(rows); i++) {
      if (!this.physics.move(this, Physics.NONE, Math.sign(rows), 1)) {
        this.hitVertically(body, Math.sign(rows), gravity);
        return;
      }

      if (this.removed()) return;
    }
  }

  /** Hit something while moving `direction` vertically: bounce off it if that is how gravity pulls, else just stop. */
  private hitVertically(body: ManaBody, direction: number, gravity: number): void {
    const speed = Math.abs(body.vy);
    const landing = direction === gravity;
    body.subY = 0;
    body.vy = landing && speed * LANDING_RESTITUTION >= MIN_REBOUND_SPEED ? -direction * speed * LANDING_RESTITUTION : 0;
    this.registerImpact(body, direction);
  }

  private moveAlongX(body: ManaBody, drive: number, grounded: boolean): void {
    body.subX += body.vx;
    const columns = Math.trunc(body.subX);
    body.subX -= columns;

    for (let i = 0; i < Math.abs(columns); i++) {
      if (!this.physics.move(this, Math.sign(columns), Physics.NONE, 1)) {
        body.subX = 0;
        if (drive !== 0 && grounded) {
          for (const member of [...body.members]) member.onSlideBlocked();
          body.vx = body.slideDrive();
        } else body.vx = Math.abs(body.vx) >= 0.3 ? -body.vx * WALL_RESTITUTION : 0;
        this.registerImpact(body, Physics.NONE);
        return;
      }

      if (this.removed()) return;
    }
  }

  private registerImpact(body: ManaBody, direction: number): void {
    for (const member of [...body.members]) {
      member.notifyImpact(direction);
    }
  }

  private notifyImpact(direction: number): void {
    const wasThrown = this.thrownFlag;
    this.thrownFlag = false;
    this.onImpact(wasThrown, direction);
  }

  /** Adds speed to the block (or the whole group it is stuck to, which shares it out). */
  applyImpulse(vx: number, vy: number): void {
    if (this.handledFlag || !this.acceptsImpulses()) return;

    this.body.vx += vx / this.body.members.length;
    this.body.vy += vy / this.body.members.length;
  }

  /** Sends the block flying with the given velocity; its first impact afterwards counts as a throw landing. */
  launch(vx: number, vy: number): void {
    this.body.stop();
    this.body.vx = vx;
    this.body.vy = vy;
    this.thrownFlag = true;
  }

  isThrown(): boolean {
    return this.thrownFlag;
  }

  override onPushed(xDirection: number, yDirection: number): void {
    if (this.handledFlag || !this.acceptsImpulses()) return;

    if (xDirection !== Physics.NONE) {
      const pushed = xDirection * PUSH_SPEED;
      if (Math.abs(this.body.vx) < PUSH_SPEED || Math.sign(this.body.vx) !== xDirection) this.body.vx = pushed;
    }

    if (yDirection === Physics.UP) {
      this.body.vy = Math.min(this.body.vy, -PUSH_LAUNCH_SPEED);
    }
  }

  override getMass(): number {
    return this.handledFlag ? 0 : 1;
  }

  override isAffectedByPlanets(): boolean {
    return true;
  }

  override getRigidGroup(): readonly Sprite[] {
    return this.body.members.length > 1 ? this.body.members : super.getRigidGroup();
  }

  canBePickedUp(): boolean {
    return !this.removed();
  }

  /** Whether picking this block up un-sticks the whole group it is in (the orange glue), not just itself. */
  protected dissolvesGroupWhenCarried(): boolean {
    return false;
  }

  /** Called as an avatar picks the block up: a carried block leaves its group (or, if it is the glue, frees all of it). */
  detachForCarrying(): void {
    if (this.body.members.length <= 1) return;

    if (this.dissolvesGroupWhenCarried()) this.body.dissolve();
    else this.body.release(this);
  }

  /** Sticks this block to `other` for good, merging them into one rigid body. */
  bondWith(other: Mana): void {
    if (this.body === other.body || this.handledFlag || other.handledFlag) return;
    this.body.merge(other.body);
  }

  joinBody(body: ManaBody): void {
    this.body = body;
  }

  override melts(): boolean {
    return this.handlingMelt;
  }

  handleMelt(): void {
    this.handlingMelt = true;
  }

  removeHandleMelt(): void {
    this.handlingMelt = false;
  }

  beingHandled(): void {
    this.handledFlag = true;
    this.thrownFlag = false;
    this.body.stop();
    this.onTouched();
  }

  setDown(): void {
    this.handledFlag = false;
  }

  isBeingHandled(): boolean {
    return this.handledFlag;
  }

  abstract getActionFrames(): Map<string, Frame[]>;
}
