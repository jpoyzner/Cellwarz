import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import { EdgeOfCellDataException } from '../errors';
import { Physics } from '../physics';
import { Missile, ROCKET_GRAVITY } from './missile';
import type { MissileLaunch } from './missile';
import { RocketLauncher } from './rocketLauncher';
import { Avatar, FLOAT_LEFT_ACTION, FLOAT_RIGHT_ACTION, JUMP_LEFT_ACTION, JUMP_RIGHT_ACTION, LAND_LEFT_ACTION, LAND_RIGHT_ACTION, RUN_LEFT_ACTION, RUN_RIGHT_ACTION, STAND_LEFT_ACTION, STAND_RIGHT_ACTION, START_FLOAT_INTERVAL, START_LAND_INTERVAL } from './avatar';

let count = 0;

const RUN_STEP_DISTANCE = 1;
const JUMP_DISTANCE = 1;
// A robot that hits an obstacle stands still for a second before it turns around and patrols back.
const TURN_AROUND_PAUSE_FRAMES = Engine.EVERY_SECOND;

// A robot that sees a real player in rocket range stops, pulls out a rocket launcher, fires an arcing rocket and
// puts the launcher away again. Distances are grid cells, speeds cells per frame.
const ROCKET_MIN_RANGE = 24;
const ROCKET_MAX_RANGE = 70;
const ROCKET_MAX_HEIGHT_DIFFERENCE = 30;
const ROCKET_SPEED_X = 0.7;
const ROCKET_MAX_LAUNCH_SPEED_Y = 2.2;
const DRAW_LAUNCHER_FRAMES = Math.round(Engine.EVERY_SECOND * 0.9);
const PUT_AWAY_LAUNCHER_FRAMES = Math.round(Engine.EVERY_SECOND * 0.75);
const ROCKET_COOLDOWN_FRAMES = Engine.EVERY_SECOND * 4;
const MISSED_TARGET_COOLDOWN_FRAMES = Engine.EVERY_SECOND;

type RocketPhase = 'idle' | 'drawing' | 'putting-away';

interface RocketShot {
  facingRight: boolean;
  launch: MissileLaunch;
  muzzleX: number;
  muzzleY: number;
}

export class Robot extends Avatar {
  /** Frames left of the stop-and-stare before turning around; 0 when not paused. */
  private turnAroundPauseFrames = 0;
  private rocketPhase: RocketPhase = 'idle';
  private rocketPhaseFrames = 0;
  private rocketCooldownFrames = 0;
  private launcher: RocketLauncher | undefined;

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(`Cyborg${++count}`, x, y, cellInit, cell);
    this.runRight();
  }

  protected override getDefaultAction(): string {
    return RUN_RIGHT_ACTION;
  }

  protected override doAction(): void {
    if (this.yPower === Physics.NONE) {
      if (this.physics.touchSprite(this, Physics.NONE, Physics.DOWN, false)) {
        if (this.xPower === Physics.NONE) {
          this.setAnimationSequence(this.facingRight ? STAND_RIGHT_ACTION : STAND_LEFT_ACTION);
        } else {
          this.setAnimationSequence(this.facingRight ? RUN_RIGHT_ACTION : RUN_LEFT_ACTION);
        }
      } else {
        this.setAnimationSequence(this.facingRight ? LAND_RIGHT_ACTION : LAND_LEFT_ACTION);
      }

      this.physics.gravitate(this);
    } else {
      if (this.yPower > START_FLOAT_INTERVAL) {
        this.setAnimationSequence(this.facingRight ? JUMP_RIGHT_ACTION : JUMP_LEFT_ACTION);
      } else if (this.yPower > START_LAND_INTERVAL) {
        this.setAnimationSequence(this.facingRight ? FLOAT_RIGHT_ACTION : FLOAT_LEFT_ACTION);
      }

      if (!this.physics.move(this, Physics.NONE, Physics.UP, JUMP_DISTANCE)) {
        this.yPower = 1;
      }

      this.yPower--;
    }

    if (this.rocketCooldownFrames > 0) this.rocketCooldownFrames--;

    if (this.updateRocketAttack()) {
      // Busy with the launcher: stand still until it is put away.
    } else if (this.turnAroundPauseFrames > 0) {
      this.turnAroundPauseFrames--;
      if (this.turnAroundPauseFrames === 0) this.turnAround();
    } else if (this.xPower !== Physics.NONE) {
      if (this.engine.actionMatchesFrequency(Engine.HALF_STEP)) {
        if (!this.physics.move(this, this.xPower, Physics.NONE, RUN_STEP_DISTANCE)) {
          this.pauseBeforeTurning();
        }
      }
    } else if (this.slidePower !== Physics.NONE) {
      this.physics.move(this, this.slidePower, Physics.NONE, RUN_STEP_DISTANCE);
      this.slidePower = Physics.NONE;
    }

    this.killTouchedPlayers();
  }

  /** Runs the pull-out / fire / put-away sequence; returns true while the robot is tied up with it. */
  private updateRocketAttack(): boolean {
    if (this.rocketPhase === 'idle') {
      if (this.rocketCooldownFrames === 0 && this.turnAroundPauseFrames === 0 && this.engine.actionMatchesFrequency(Engine.EIGHTH_STEP)) {
        const shot = this.findShot();
        if (shot) this.drawLauncher(shot);
      }

      return this.rocketPhase !== 'idle';
    }

    this.launcher?.follow(this.facingRight);
    this.rocketPhaseFrames--;

    if (this.rocketPhaseFrames <= 0) {
      if (this.rocketPhase === 'drawing') this.fire();
      else this.putAwayLauncher();
    }

    return true;
  }

  private drawLauncher(shot: RocketShot): void {
    this.xPower = Physics.NONE;
    this.slidePower = Physics.NONE;
    this.facingRight = shot.facingRight;
    this.launcher = new RocketLauncher(this, this.facingRight, this.cell);
    this.rocketPhase = 'drawing';
    this.rocketPhaseFrames = DRAW_LAUNCHER_FRAMES;
  }

  /** Fires at wherever the target is by now, or just puts the launcher away if nobody is in range any more. */
  private fire(): void {
    const shot = this.findShot();

    if (shot) {
      this.facingRight = shot.facingRight;
      this.launcher?.follow(this.facingRight);
      new Missile(shot.muzzleX, shot.muzzleY, shot.facingRight ? Physics.RIGHT : Physics.LEFT, this.cell, shot.launch);
    }

    this.rocketCooldownFrames = shot ? ROCKET_COOLDOWN_FRAMES : MISSED_TARGET_COOLDOWN_FRAMES;
    this.rocketPhase = 'putting-away';
    this.rocketPhaseFrames = PUT_AWAY_LAUNCHER_FRAMES;
  }

  private putAwayLauncher(): void {
    this.launcher?.removePermanently();
    this.launcher = undefined;
    this.rocketPhase = 'idle';

    if (this.facingRight) this.runRight();
    else this.runLeft();
  }

  /** The nearest real player a rocket arc can reach right now (in range, and nothing solid in the way), if any. */
  private findShot(): RocketShot | undefined {
    let best: { shot: RocketShot; distance: number } | undefined;

    for (const sprite of this.getCellData().getSprites()) {
      if (!(sprite instanceof Avatar) || sprite.isRobot() || sprite.removed() || sprite.getConsumeScale() !== undefined) continue;

      const shot = this.aimAt(sprite);
      const distance = Math.abs(sprite.getX() - this.getX());
      if (shot && (!best || distance < best.distance)) best = { shot, distance };
    }

    return best?.shot;
  }

  private aimAt(target: Avatar): RocketShot | undefined {
    const targetX = target.getX() + target.getWidth() / 2;
    const targetY = target.getY() + target.getHeight() / 2;
    const facingRight = targetX > this.getX() + this.getWidth() / 2;
    const [muzzleX, muzzleY] = RocketLauncher.muzzleFor(this, facingRight);

    const dx = targetX - muzzleX;
    const dy = targetY - muzzleY;
    const horizontalDistance = Math.abs(targetX - (this.getX() + this.getWidth() / 2));
    if (horizontalDistance < ROCKET_MIN_RANGE || horizontalDistance > ROCKET_MAX_RANGE) return undefined;
    if (Math.abs(dy) > ROCKET_MAX_HEIGHT_DIFFERENCE || Math.sign(dx) !== (facingRight ? 1 : -1)) return undefined;

    // Solve the launch so the arc passes through the target after t frames of flight.
    const flightFrames = Math.abs(dx) / ROCKET_SPEED_X;
    const vy = (dy - (ROCKET_GRAVITY * flightFrames * (flightFrames + 1)) / 2) / flightFrames;
    if (Math.abs(vy) > ROCKET_MAX_LAUNCH_SPEED_Y) return undefined;

    const launch = { vx: (facingRight ? 1 : -1) * ROCKET_SPEED_X, vy };
    const reaches = Missile.pathReaches(this.getCellData(), muzzleX, muzzleY, launch, {
      x: target.getX(),
      y: target.getY(),
      width: target.getWidth(),
      height: target.getHeight(),
    });

    return reaches ? { facingRight, launch, muzzleX, muzzleY } : undefined;
  }

  override removePermanently(): void {
    super.removePermanently();
    this.launcher?.removePermanently();
    this.launcher = undefined;
  }

  override isRobot(): boolean {
    return true;
  }

  /** Blocked: stand still (facing the obstacle) for a second, then turn around. */
  private pauseBeforeTurning(): void {
    this.xPower = Physics.NONE;
    this.slidePower = Physics.NONE;
    this.turnAroundPauseFrames = TURN_AROUND_PAUSE_FRAMES;
  }

  /** Robots are lethal: any player avatar overlapping or directly adjacent to this robot dies (and becomes a robot). */
  private killTouchedPlayers(): void {
    const left = this.getClippedX() - 1;
    const right = this.getClippedX() + this.getClippedWidth();
    const top = this.getClippedY() - 1;
    const bottom = this.getClippedY() + this.getClippedHeight();
    const touched = new Set<Avatar>();

    for (let column = left; column <= right; column++) {
      for (let row = top; row <= bottom; row++) {
        const isCorner = (column === left || column === right) && (row === top || row === bottom);
        if (isCorner) continue;

        try {
          for (const sprite of this.getCellData().getMapPosition(column, row) ?? []) {
            if (sprite instanceof Avatar && !(sprite instanceof Robot) && !sprite.removed()) touched.add(sprite);
          }
        } catch (e) {
          if (!(e instanceof EdgeOfCellDataException)) throw e;
        }
      }
    }

    for (const avatar of touched) {
      this.assimilate(avatar);
    }
  }

  /** The victim dies (knocked away) and their body gets up again as a robot that patrols like any other. */
  private assimilate(avatar: Avatar): void {
    const session = this.cell.getWorld().getZion().getHardlines().get(avatar.getName());
    const awayFromRobot = Math.sign(avatar.getX() - this.getX());
    avatar.die(awayFromRobot, Physics.NONE);

    const converted = new Robot(avatar.getX(), avatar.getY(), false, this.cell);
    if (awayFromRobot < 0) converted.runLeft();
    session?.setRobotBody(converted);
  }

  /** Patrol behavior: bounce off whatever blocked the current direction and head back the other way. */
  private turnAround(): void {
    if (this.facingRight) {
      this.runLeft();
    } else {
      this.runRight();
    }
  }

  override showName(): boolean {
    return false;
  }
}
