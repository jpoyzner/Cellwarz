import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import type { Session } from '../session';
import type { CellData } from '../cellData';
import { Sprite } from './sprite';
import { Mana } from './mana';
import { Portal } from './portal';
import type { Structure } from './structure';
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
  private structure: Structure | undefined;
  private structureChangeUpdate = 0;
  private firstDraw: number;
  private handledMana: Mana | undefined;

  protected facingRight = true;
  protected yPower = Physics.NONE;
  protected xPower = Physics.NONE;
  protected slidePower = Physics.NONE;
  private coyoteFramesRemaining = 0;
  private jumpBufferedFrames = 0;
  private jumpStartedAt = 0;

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

      this.physics.gravitate(this);
      this.adjustHandledMana();
    } else {
      if (this.yPower > START_FLOAT_INTERVAL) {
        this.setAnimationSequence(this.facingRight ? JUMP_RIGHT_ACTION : JUMP_LEFT_ACTION);
      } else if (this.yPower > START_LAND_INTERVAL) {
        this.setAnimationSequence(this.facingRight ? FLOAT_RIGHT_ACTION : FLOAT_LEFT_ACTION);
      }

      if (this.physics.move(this, Physics.NONE, Physics.UP, JUMP_DISTANCE)) {
        this.adjustHandledMana();
      } else {
        this.yPower = 1;
      }

      this.yPower--;
    }

    if (this.xPower !== Physics.NONE) {
      if (this.engine.actionMatchesFrequency(Engine.HALF_STEP)) {
        if (this.physics.move(this, this.xPower, Physics.NONE, RUN_STEP_DISTANCE)) {
          this.adjustHandledMana();
        }

        for (const sprite of this.physics.getSpritesAtSamePosition(this)) {
          if (sprite instanceof Portal) {
            sprite.warpRandomly(this);
          }
        }
      }
    } else if (this.slidePower !== Physics.NONE) {
      if (this.physics.move(this, this.slidePower, Physics.NONE, RUN_STEP_DISTANCE)) {
        this.adjustHandledMana();
      }

      this.slidePower = Physics.NONE;
    }

    this.checkStructureConnection();

    if (this.firstDraw !== 0) {
      this.firstDraw--;
    }

    if (this.structureChangeUpdate !== 0) {
      this.structureChangeUpdate--;
    }
  }

  // TODO: issue when walking under something just tall enough for avatar when handling mana.
  private adjustHandledMana(): void {
    if (this.handledMana) {
      this.physics.moveTo(this.handledMana, this.getX() + 1, this.getY() - this.handledMana.getHeight());
    }
  }

  private checkStructureConnection(): void {
    if (this.structure) {
      for (const sprite of this.physics.getSpritesUnder(this, Physics.NONE, 0)) {
        if (sprite instanceof Mana && sprite.getStructure() === this.structure) {
          return;
        }
      }

      this.toggleConnectToStructure();
    }
  }

  protected override animate(): boolean {
    return true;
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
    if (!this.structure) {
      this.xPower = Physics.LEFT;
      this.facingRight = false;
    }
  }

  runRight(): void {
    if (!this.structure) {
      this.xPower = Physics.RIGHT;
      this.facingRight = true;
    }
  }

  stopRunning(): void {
    this.slidePower = this.xPower;
    this.xPower = Physics.NONE;
  }

  attemptJump(): void {
    if (this.structure || this.yPower !== Physics.NONE) {
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

  showName(): boolean {
    return this.firstDraw > 0;
  }

  needsStructureChangeUpdate(): boolean {
    return this.structureChangeUpdate > 0;
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

  getStructure(): Structure | undefined {
    return this.structure;
  }

  override melts(): boolean {
    return true;
  }

  // TODO: just gets the first mana's structure, should start search for connecting manas as a structure.
  toggleConnectToStructure(): void {
    if (!this.structure) {
      for (const sprite of this.physics.getSpritesUnder(this, Physics.NONE, 0)) {
        if (sprite instanceof Mana) {
          this.setStructure(sprite.getStructure());
          break;
        }
      }
    } else {
      this.structure.deactivateAllManaActions();
      this.setStructure(undefined);
    }
  }

  setStructure(structure: Structure | undefined): this {
    this.structure = structure;

    if (structure) {
      structure.setAvatar(this);
    }

    this.structureChangeUpdate = Engine.REDRAW_ECHO_FRAMES;
    return this;
  }

  // TODO: need to check if mana can be moved up and whether avatar can be moved down (and vice-versa for setting down).
  toggleHandleMana(): void {
    if (!this.handledMana) {
      for (const sprite of this.physics.getSpritesUnder(this, Physics.NONE, 0)) {
        if (sprite instanceof Mana) {
          const mana = sprite;
          mana.handleMelt();
          this.physics.move(this, Physics.NONE, Physics.DOWN, mana.getHeight());
          this.physics.move(mana, Physics.NONE, Physics.UP, this.getHeight());
          mana.removeHandleMelt();
          mana.beingHandled();
          this.handledMana = mana;
          break;
        }
      }
    } else {
      this.handledMana.handleMelt();
      this.physics.move(this.handledMana, Physics.NONE, Physics.DOWN, this.getHeight());
      this.physics.move(this, Physics.NONE, Physics.UP, this.handledMana.getHeight());
      this.handledMana.removeHandleMelt();
      this.setManaDown();
    }
  }

  setManaDown(): void {
    if (this.handledMana) {
      this.handledMana.setDown();
      this.handledMana = undefined;
    }
  }

  activateManaAction(manaIndex: number, actionIndex: number): void {
    this.getStructure()?.activateManaAction(manaIndex, actionIndex);
  }

  getSession(): Session | undefined {
    return this.session;
  }

  setSession(session: Session): void {
    this.session = session;
  }
}
