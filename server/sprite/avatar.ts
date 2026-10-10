import type { Cell } from '../cell/cell';
import { EdgeOfCellDataException } from '../errors';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import type { Session } from '../session';
import type { CellData } from '../cellData';
import { Sprite } from './sprite';
import { Mana } from './mana';
import { Portal } from './portal';
import { getAdjacentSprites } from './adjacent';
import { addAction, addClippedAction } from './frames';

export const STAND_RIGHT_ACTION = 'stand_right';
export const STAND_LEFT_ACTION = 'stand_left';
export const RUN_RIGHT_ACTION = 'run_right';
export const RUN_LEFT_ACTION = 'run_left';
export const JUMP_RIGHT_ACTION = 'jump_right';
export const JUMP_LEFT_ACTION = 'jump_left';
export const FLOAT_RIGHT_ACTION = 'float_right';
export const FLOAT_LEFT_ACTION = 'float_left';
export const LAND_RIGHT_ACTION = 'land_right';
export const LAND_LEFT_ACTION = 'land_left';

const RUN_STEP_DISTANCE = 1;
const JUMP_DISTANCE = 1;
const DEATH_KNOCKBACK_DISTANCE = 3;
// A thrown block's launch velocity (cells per frame): forward and up, so it flies in a short arc.
const THROW_SPEED_X = 0.8;
const THROW_SPEED_Y = -1.5;
// The avatar's own motion (cells per frame, measured over the last few frames) is added to a throw; capped so a
// warp or knockback can't turn into an absurd launch.
const MOTION_SAMPLE_FRAMES = Engine.HALF_STEP;
const MAX_INHERITED_SPEED = 2;
// While an active yellow block touches the avatar (it carries it, or stands against it) it is lifted: for this many
// frames after each touch it rises one cell every LIFTED_RISE_FRAMES frames instead of falling — a glide upwards.
const LIFTED_FRAMES = 3;
const LIFTED_RISE_FRAMES = 3;

export const FULL_JUMP_ACTION_LENGTH = 24;
const JUMP_ACTION_LENGTH = 10;
const FLOAT_ACTION_LENGTH = 8;
export const START_FLOAT_INTERVAL = FULL_JUMP_ACTION_LENGTH - JUMP_ACTION_LENGTH;
export const START_LAND_INTERVAL = START_FLOAT_INTERVAL - FLOAT_ACTION_LENGTH;

// Releasing the jump key early (a "short hop") cuts the ascent down to this length instead of the full one.
const MIN_JUMP_ACTION_LENGTH = 8;
// A release arriving faster than this (real elapsed ms) can't be a genuine human tap — it's an instantaneous
// keydown+keyup, like an automated test's zero-delay key press — so it's treated as a full-height jump instead
// of silently shrinking every scripted/bot input down to the minimum.
const MIN_HOLD_BEFORE_RELEASE_MS = 100;
// Grace window (frames) a jump still registers after walking off a ledge, or a jump press still registers
// just before landing — both are additive forgiveness, they never change the jump itself.
const COYOTE_TIME_FRAMES = 6;
const JUMP_BUFFER_FRAMES = 6;

export class Avatar extends Sprite {
  static readonly WIDTH = 6;
  static readonly HEIGHT = 8;

  private static readonly actionFrames = new Map<string, Frame[]>();

  private readonly name: string;

  private session: Session | undefined;
  private firstDraw: number;
  private handledMana: Mana | undefined;
  private sleeping = false;
  private liftedFrames = 0;

  protected facingRight = true;
  protected yPower = Physics.NONE;
  protected xPower = Physics.NONE;
  protected slidePower = Physics.NONE;
  private coyoteFramesRemaining = 0;
  private jumpBufferedFrames = 0;
  private jumpStartedAt = 0;
  private readonly recentPositions: { x: number; y: number }[] = [];

  getActionFrames(): Map<string, Frame[]> {
    return Avatar.actionFrames;
  }

  static init(cellData: CellData): void {
    addClippedAction(cellData, STAND_RIGHT_ACTION, 'me/stand', 6, 0, 1, 0, 1, false, Avatar.actionFrames);
    addClippedAction(cellData, STAND_LEFT_ACTION, 'me/stand', 6, 0, 1, 0, 1, true, Avatar.actionFrames);
    addAction(cellData, RUN_RIGHT_ACTION, 'me/run', 12, false, Avatar.actionFrames);
    addAction(cellData, RUN_LEFT_ACTION, 'me/run', 12, true, Avatar.actionFrames);
    addAction(cellData, JUMP_RIGHT_ACTION, 'me/jump', 1, false, Avatar.actionFrames);
    addAction(cellData, JUMP_LEFT_ACTION, 'me/jump', 1, true, Avatar.actionFrames);
    addAction(cellData, FLOAT_RIGHT_ACTION, 'me/float', 1, false, Avatar.actionFrames);
    addAction(cellData, FLOAT_LEFT_ACTION, 'me/float', 1, true, Avatar.actionFrames);
    addAction(cellData, LAND_RIGHT_ACTION, 'me/land', 1, false, Avatar.actionFrames);
    addAction(cellData, LAND_LEFT_ACTION, 'me/land', 1, true, Avatar.actionFrames);
  }

  constructor(name: string, x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
    this.name = name;
    this.firstDraw = Engine.REDRAW_ECHO_FRAMES;
  }

  getWidth(): number {
    return Avatar.WIDTH;
  }

  getHeight(): number {
    return Avatar.HEIGHT;
  }

  protected override getDefaultAction(): string {
    return STAND_RIGHT_ACTION;
  }

  protected override doAction(): void {
    const lifted = this.liftedFrames > 0;
    if (lifted) this.liftedFrames--;

    if (this.yPower === Physics.NONE) {
      const grounded = this.physics.touchSprite(this, Physics.NONE, Physics.DOWN, false);

      if (grounded) {
        this.coyoteFramesRemaining = COYOTE_TIME_FRAMES;
        if (this.jumpBufferedFrames > 0) {
          this.startJump();
        }
      } else if (this.coyoteFramesRemaining > 0) {
        this.coyoteFramesRemaining--;
      }

      if (this.jumpBufferedFrames > 0) {
        this.jumpBufferedFrames--;
      }

      if (grounded) {
        if (this.xPower === Physics.NONE) {
          this.setAnimationSequence(this.facingRight ? STAND_RIGHT_ACTION : STAND_LEFT_ACTION);
        } else {
          this.setAnimationSequence(this.facingRight ? RUN_RIGHT_ACTION : RUN_LEFT_ACTION);
        }
      } else {
        this.setAnimationSequence(this.facingRight ? LAND_RIGHT_ACTION : LAND_LEFT_ACTION);
      }

      if (lifted) {
        if (this.engine.actionMatchesFrequency(LIFTED_RISE_FRAMES)) this.moveCarrying(Physics.NONE, Physics.UP, 1);
      } else {
        this.physics.gravitate(this);
      }
      this.adjustHandledMana();
    } else {
      if (this.yPower > START_FLOAT_INTERVAL) {
        this.setAnimationSequence(this.facingRight ? JUMP_RIGHT_ACTION : JUMP_LEFT_ACTION);
      } else if (this.yPower > START_LAND_INTERVAL) {
        this.setAnimationSequence(this.facingRight ? FLOAT_RIGHT_ACTION : FLOAT_LEFT_ACTION);
      }

      if (this.moveCarrying(Physics.NONE, Physics.UP, JUMP_DISTANCE)) {
        this.adjustHandledMana();
      } else {
        this.yPower = 1;
      }

      this.yPower--;
    }

    if (this.xPower !== Physics.NONE) {
      if (this.engine.actionMatchesFrequency(Engine.HALF_STEP)) {
        if (this.moveCarrying(this.xPower, Physics.NONE, RUN_STEP_DISTANCE)) {
          this.adjustHandledMana();
        }

        for (const sprite of this.physics.getSpritesAtSamePosition(this)) {
          if (sprite instanceof Portal) {
            sprite.warpRandomly(this);
          }
        }
      }
    } else if (this.slidePower !== Physics.NONE) {
      if (this.moveCarrying(this.slidePower, Physics.NONE, RUN_STEP_DISTANCE)) {
        this.adjustHandledMana();
      }

      this.slidePower = Physics.NONE;
    }

    this.touchAdjacentMana();
    this.recordPosition();

    if (this.firstDraw !== 0) {
      this.firstDraw--;
    }
  }

  /**
   * A move that takes the carried block along: it is refused (like running into a wall) when the block, riding over the
   * avatar's head, would end up inside a wall or another block.
   */
  private moveCarrying(xDirection: number, yDirection: number, distance: number): boolean {
    const mana = this.handledMana;
    if (mana && !mana.removed()) {
      for (let step = 1; step <= distance; step++) {
        if (!this.isSpotOverHeadFree(mana, xDirection * step, yDirection * step)) return false;
      }
    }

    return this.physics.move(this, xDirection, yDirection, distance);
  }

  private adjustHandledMana(): void {
    if (this.handledMana?.removed()) {
      this.handledMana = undefined;
    }

    const mana = this.handledMana;
    if (!mana) return;

    // Only a shove from outside can get here (the avatar's own moves check first): rather than drag the block into a
    // wall, the avatar lets go of it where it is.
    if (!this.isSpotOverHeadFree(mana)) {
      this.setManaDown();
      return;
    }

    this.physics.moveTo(mana, this.getHandledManaX(), this.getHandledManaY(mana));
  }

  /** Any block standing against, under or over this avatar counts as touched (some blocks react to that). */
  private touchAdjacentMana(): void {
    for (const sprite of getAdjacentSprites(this)) {
      if (sprite instanceof Mana && !sprite.removed()) sprite.touch();
    }
  }

  /** An active yellow block is touching this avatar: it drifts upwards for a few frames instead of falling. */
  lift(): void {
    this.liftedFrames = LIFTED_FRAMES;
  }

  /** Robots override this: only real players pick things up, collect diamonds and get hit by rockets. */
  isRobot(): boolean {
    return false;
  }

  protected override animate(): boolean {
    return !this.sleeping; // a sleeper stands perfectly still instead of cycling its stand frames.
  }

  override getAnimationFrequency(): number {
    if (this.getAnimationSequence() === STAND_LEFT_ACTION || this.getAnimationSequence() === STAND_RIGHT_ACTION) {
      return Engine.QUARTER_STEP;
    } else if (this.getAnimationSequence() === RUN_LEFT_ACTION || this.getAnimationSequence() === RUN_RIGHT_ACTION) {
      return Engine.HALF_STEP;
    }

    return Engine.ALL_STEPS;
  }

  getLayer(): number {
    return Physics.OBJECT_LAYER;
  }

  override isAffectedByPlanets(): boolean {
    return true;
  }

  override onConsumed(): void {
    this.die();
  }

  runLeft(): void {
    this.xPower = Physics.LEFT;
    this.facingRight = false;
  }

  runRight(): void {
    this.xPower = Physics.RIGHT;
    this.facingRight = true;
  }

  stopRunning(): void {
    this.slidePower = this.xPower;
    this.xPower = Physics.NONE;
  }

  attemptJump(): void {
    if (this.yPower !== Physics.NONE) {
      return;
    }

    if (this.physics.touchSprite(this, Physics.NONE, Physics.DOWN, false) || this.coyoteFramesRemaining > 0) {
      this.startJump();
    } else {
      // Not grounded and outside the coyote window: remember the press and consume it the instant we land.
      this.jumpBufferedFrames = JUMP_BUFFER_FRAMES;
    }
  }

  /** Releasing the jump key early cuts the ascent short (variable jump height); holding it keeps the full arc. */
  releaseJump(): void {
    if (this.yPower > MIN_JUMP_ACTION_LENGTH && Date.now() - this.jumpStartedAt >= MIN_HOLD_BEFORE_RELEASE_MS) {
      this.yPower = MIN_JUMP_ACTION_LENGTH;
    }
  }

  private startJump(): void {
    this.yPower = FULL_JUMP_ACTION_LENGTH;
    this.coyoteFramesRemaining = 0;
    this.jumpBufferedFrames = 0;
    this.jumpStartedAt = Date.now();
  }

  getName(): string {
    return this.name;
  }

  /** A player who pressed Escape or lost their connection while alive: the avatar stands there asleep. */
  isSleeping(): boolean {
    return this.sleeping;
  }

  fallAsleep(): void {
    this.sleeping = true;
    this.xPower = Physics.NONE; // no slide either: a sleeper just stands (or finishes falling) where it is.
    this.slidePower = Physics.NONE;
    this.setFrame(0); // frozen on the first frame of whatever it is doing (a stand, once it is on the ground).
    this.needsRedraw(true); // so clients hear about it even if nothing else changes this frame.
  }

  wakeUp(): void {
    this.sleeping = false;
    this.needsRedraw(true);
  }

  showName(): boolean {
    return this.firstDraw > 0;
  }

  /** Optional knockback direction gives death a little physicality instead of an instant, silent vanish. */
  die(knockbackXDirection: number = Physics.NONE, knockbackYDirection: number = Physics.NONE): void {
    const session = this.cell.getWorld().getZion().getHardlines().get(this.name);
    if (session) {
      session.unplug();
    }

    if (knockbackXDirection !== Physics.NONE || knockbackYDirection !== Physics.NONE) {
      this.physics.move(this, knockbackXDirection, knockbackYDirection, DEATH_KNOCKBACK_DISTANCE, false);
    }

    this.removePermanently();
  }

  override melts(): boolean {
    return true;
  }

  hasHandledMana(): boolean {
    return this.handledMana !== undefined;
  }

  // TODO: need to check if mana can be moved up and whether avatar can be moved down (and vice-versa for setting down).
  /**
   * Picks up the nearest block this avatar is touching (beside, under or over it; a block stuck to others leaves them,
   * the orange glue frees them all). A block under the feet swaps places with the avatar; one touched from the side or
   * above is lifted onto the spot over the avatar's head, if that is free.
   */
  pickUpMana(): void {
    if (this.handledMana) return;

    const underFeet = this.physics.getSpritesUnder(this, Physics.NONE, 0);
    for (const mana of this.getTouchedManaByDistance()) {
      if (underFeet.has(mana)) {
        this.liftManaFromUnderFeet(mana);
        return;
      }

      if (this.isSpotOverHeadFree(mana)) {
        mana.detachForCarrying();
        this.physics.moveTo(mana, this.getHandledManaX(), this.getHandledManaY(mana));
        mana.beingHandled();
        this.handledMana = mana;
        return;
      }
    }
  }

  private liftManaFromUnderFeet(mana: Mana): void {
    mana.detachForCarrying();
    mana.handleMelt();
    this.physics.move(this, Physics.NONE, Physics.DOWN, mana.getHeight());
    this.physics.move(mana, Physics.NONE, Physics.UP, this.getHeight());
    mana.removeHandleMelt();
    mana.beingHandled();
    this.handledMana = mana;
  }

  /** Every pickable block touching this avatar, nearest (centre to centre) first. */
  private getTouchedManaByDistance(): Mana[] {
    const touched = new Set<Mana>();
    const candidates = [...getAdjacentSprites(this), ...this.physics.getSpritesUnder(this, Physics.NONE, 0)];
    for (const sprite of candidates) {
      if (sprite instanceof Mana && sprite.canBePickedUp()) touched.add(sprite);
    }

    const centerX = this.getX() + this.getWidth() / 2;
    const centerY = this.getY() + this.getHeight() / 2;
    const distance = (mana: Mana) =>
      Math.hypot(mana.getX() + mana.getWidth() / 2 - centerX, mana.getY() + mana.getHeight() / 2 - centerY);

    return [...touched].sort((a, b) => distance(a) - distance(b));
  }

  private getHandledManaX(): number {
    return this.getX() + 1;
  }

  private getHandledManaY(mana: Mana): number {
    return this.getY() - mana.getHeight();
  }

  /** Whether `mana` fits in the carrying spot over the avatar's head, shifted by the offsets (walls, other blocks and the room's edge block it). */
  private isSpotOverHeadFree(mana: Mana, xOffset = 0, yOffset = 0): boolean {
    const left = this.getHandledManaX() + xOffset;
    const top = this.getHandledManaY(mana) + yOffset;

    try {
      for (let column = left; column < left + mana.getWidth(); column++) {
        for (let row = top; row < top + mana.getHeight(); row++) {
          for (const other of this.getCellData().getMapPosition(column, row) ?? []) {
            const ignored = other === this || other === mana || mana.getRigidGroup().includes(other);
            if (!ignored && !other.melts() && other.getLayer() <= mana.getLayer()) return false;
          }
        }
      }
    } catch (e) {
      if (e instanceof EdgeOfCellDataException) return false;
      throw e;
    }

    return true;
  }

  /** Puts the carried block back down under this avatar's feet. */
  putDownMana(): void {
    if (!this.handledMana) return;

    this.handledMana.handleMelt();
    this.physics.move(this.handledMana, Physics.NONE, Physics.DOWN, this.getHeight());
    this.physics.move(this, Physics.NONE, Physics.UP, this.handledMana.getHeight());
    this.handledMana.removeHandleMelt();
    this.setManaDown();
  }

  private recordPosition(): void {
    this.recentPositions.push({ x: this.getX(), y: this.getY() });
    if (this.recentPositions.length > MOTION_SAMPLE_FRAMES + 1) this.recentPositions.shift();
  }

  /** The avatar's recent velocity in cells per frame (running, jumping, falling), from its actual displacement. */
  private getRecentVelocity(): { vx: number; vy: number } {
    const oldest = this.recentPositions[0];
    if (!oldest) return { vx: 0, vy: 0 };

    const frames = this.recentPositions.length - 1;
    if (frames < 1) return { vx: 0, vy: 0 };

    const clamp = (v: number) => Math.max(-MAX_INHERITED_SPEED, Math.min(MAX_INHERITED_SPEED, v));
    return { vx: clamp((this.getX() - oldest.x) / frames), vy: clamp((this.getY() - oldest.y) / frames) };
  }

  /** Throws the carried block ahead in an arc, in the direction this avatar faces, plus this avatar's own motion. */
  throwMana(): void {
    const mana = this.handledMana;
    if (!mana) return;

    this.handledMana = undefined;
    mana.setDown();
    const { vx, vy } = this.getRecentVelocity();
    mana.launch((this.facingRight ? Physics.RIGHT : Physics.LEFT) * THROW_SPEED_X + vx, THROW_SPEED_Y + vy);
  }

  setManaDown(): void {
    if (this.handledMana) {
      this.handledMana.setDown();
      this.handledMana = undefined;
    }
  }

  getSession(): Session | undefined {
    return this.session;
  }

  setSession(session: Session): void {
    this.session = session;
  }
}
