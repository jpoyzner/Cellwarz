import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import { EdgeOfCellDataException } from '../errors';
import { ROBOT_SPOTTED_EMOJI } from '../emoji';
import type { DeathCause } from '../deathCause';
import { Physics } from '../physics';
import { canReach } from './blast';
import { Diamond } from './diamond';
import { Missile, ROCKET_GRAVITY } from './missile';
import type { MissileLaunch } from './missile';
import { Avatar, FLOAT_LEFT_ACTION, FLOAT_RIGHT_ACTION, JUMP_LEFT_ACTION, JUMP_RIGHT_ACTION, LAND_LEFT_ACTION, LAND_RIGHT_ACTION, RUN_LEFT_ACTION, RUN_RIGHT_ACTION, STAND_LEFT_ACTION, STAND_RIGHT_ACTION, START_FLOAT_INTERVAL, START_LAND_INTERVAL } from './avatar';

let count = 0;

const RUN_STEP_DISTANCE = 1;
const JUMP_DISTANCE = 1;
// A robot that hits an obstacle stands still for a second before it turns around and patrols back.
const TURN_AROUND_PAUSE_FRAMES = Engine.EVERY_SECOND;

// A robot that sees a real player in rocket range stops, takes aim for a moment and fires an arcing rocket.
// Distances are grid cells, speeds cells per frame.
const ROCKET_MIN_RANGE = 24;
const ROCKET_MAX_RANGE = 70;
const ROCKET_MAX_HEIGHT_DIFFERENCE = 30;
const ROCKET_SPEED_X = 0.7;
const ROCKET_MAX_LAUNCH_SPEED_Y = 2.2;
const AIM_FRAMES = Math.round(Engine.EVERY_SECOND * 0.9);
// Where a rocket starts, relative to the robot: just past its side, and a little below its top.
const MUZZLE_REACH = 5;
const MUZZLE_DROP = 2;
const ROCKET_COOLDOWN_FRAMES = Engine.EVERY_SECOND * 4;
const MISSED_TARGET_COOLDOWN_FRAMES = Engine.EVERY_SECOND;

// A robot notices a player who is within this many cells (straight-line) with nothing solid between them.
const SIGHT_RANGE = ROCKET_MAX_RANGE;
// A player dying this close (straight-line, even through a wall) is noticed by every robot; farther away it takes line of sight.
const DEATH_NOTICE_RANGE = 30;

// A robot's destruction scatters this many diamonds (collectible like the rainbow block's), fanned out sideways.
const DIAMONDS_PER_ROBOT = 50;
const DIAMOND_SPREAD = 2;
const DIAMOND_MIN_LIFT = 0.6;
const DIAMOND_EXTRA_LIFT = 1.4;

type RocketPhase = 'idle' | 'aiming';

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
  /** Names of the players this robot has already noticed (the skull is only for the first sighting). */
  private readonly seenPlayers = new Set<string>();

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

    if (this.engine.actionMatchesFrequency(Engine.EIGHTH_STEP)) this.noticeNewPlayers();

    if (this.updateRocketAttack()) {
      // Taking aim: stand still until the rocket is away.
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

  /** A player this robot can see for the first time gets a skull over the robot's head (once per player name, per robot). */
  private noticeNewPlayers(): void {
    for (const sprite of this.getCellData().getSprites()) {
      if (!(sprite instanceof Avatar) || sprite.isRobot() || sprite.removed() || this.seenPlayers.has(sprite.getName())) continue;
      if (!this.canSee(sprite)) continue;

      this.seenPlayers.add(sprite.getName());
      this.showEmoji(ROBOT_SPOTTED_EMOJI);
    }
  }

  /** Within sight range with nothing solid in the way. */
  private canSee(target: Avatar): boolean {
    return this.distanceTo(target) <= SIGHT_RANGE && canReach(this.getCellData(), this.getEyeX(), this.getEyeY(), target);
  }

  private distanceTo(target: Avatar): number {
    return Math.hypot(target.getX() + target.getWidth() / 2 - this.getEyeX(), target.getY() + target.getHeight() / 2 - this.getEyeY());
  }

  private getEyeX(): number {
    return this.getX() + this.getWidth() / 2;
  }

  private getEyeY(): number {
    return this.getY() + 1;
  }

  /** Every robot that is close to a dying player (even through a wall) or can see it die shows a skull. */
  override noticePlayerDeath(victim: Avatar): void {
    if (this.distanceTo(victim) <= DEATH_NOTICE_RANGE || this.canSee(victim)) this.showEmoji(ROBOT_SPOTTED_EMOJI);
  }

  /** A destroyed robot bursts into diamonds, fanned out left and right and flung up at varying heights. */
  override die(knockbackXDirection: number = Physics.NONE, knockbackYDirection: number = Physics.NONE, cause?: DeathCause): void {
    if (!this.removed()) this.dropDiamonds();
    super.die(knockbackXDirection, knockbackYDirection, cause);
  }

  // A planet swallowing a robot isn't a kill, so it leaves nothing behind.
  override onConsumed(): void {
    this.removePermanently();
  }

  private dropDiamonds(): void {
    const x = Math.round(this.getX() + (this.getWidth() - Diamond.SIZE) / 2);
    const y = Math.round(this.getY() + (this.getHeight() - Diamond.SIZE) / 2);

    for (let i = 0; i < DIAMONDS_PER_ROBOT; i++) {
      const spread = (i / (DIAMONDS_PER_ROBOT - 1)) * 2 - 1;
      const vx = spread * DIAMOND_SPREAD + (Math.random() - 0.5) * 0.3;
      new Diamond(x, y, vx, -DIAMOND_MIN_LIFT - Math.random() * DIAMOND_EXTRA_LIFT, this.cell);
    }
  }

  /** Runs the aim-then-fire sequence; returns true while the robot is tied up with it. */
  private updateRocketAttack(): boolean {
    if (this.rocketPhase === 'idle') {
      if (this.rocketCooldownFrames === 0 && this.turnAroundPauseFrames === 0 && this.engine.actionMatchesFrequency(Engine.EIGHTH_STEP)) {
        const shot = this.findShot();
        if (shot) this.startAiming(shot);
      }

      return this.rocketPhase !== 'idle';
    }

    this.rocketPhaseFrames--;
    if (this.rocketPhaseFrames > 0) return true;

    this.fire();
    return false;
  }

  private startAiming(shot: RocketShot): void {
    this.xPower = Physics.NONE;
    this.slidePower = Physics.NONE;
    this.facingRight = shot.facingRight;
    this.rocketPhase = 'aiming';
    this.rocketPhaseFrames = AIM_FRAMES;
  }

  /** Fires at wherever the target is by now (or just gives up if nobody is in range any more), then resumes patrolling. */
  private fire(): void {
    const shot = this.findShot();

    if (shot) {
      this.facingRight = shot.facingRight;
      new Missile(shot.muzzleX, shot.muzzleY, shot.facingRight ? Physics.RIGHT : Physics.LEFT, this.cell, shot.launch);
    }

    this.rocketCooldownFrames = shot ? ROCKET_COOLDOWN_FRAMES : MISSED_TARGET_COOLDOWN_FRAMES;
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
    const muzzleX = facingRight ? this.getX() + this.getWidth() + MUZZLE_REACH : this.getX() - MUZZLE_REACH - 2;
    const muzzleY = this.getY() + MUZZLE_DROP;

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
