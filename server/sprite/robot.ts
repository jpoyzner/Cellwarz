import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import { EdgeOfCellDataException } from '../errors';
import { Physics } from '../physics';
import { Avatar, FLOAT_LEFT_ACTION, FLOAT_RIGHT_ACTION, JUMP_LEFT_ACTION, JUMP_RIGHT_ACTION, LAND_LEFT_ACTION, LAND_RIGHT_ACTION, RUN_LEFT_ACTION, RUN_RIGHT_ACTION, STAND_LEFT_ACTION, STAND_RIGHT_ACTION, START_FLOAT_INTERVAL, START_LAND_INTERVAL } from './avatar';

let count = 0;

const RUN_STEP_DISTANCE = 1;
const JUMP_DISTANCE = 1;
// A robot that hits an obstacle stands still for a second before it turns around and patrols back.
const TURN_AROUND_PAUSE_FRAMES = Engine.EVERY_SECOND;

export class Robot extends Avatar {
  /** Frames left of the stop-and-stare before turning around; 0 when not paused. */
  private turnAroundPauseFrames = 0;

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

    if (this.turnAroundPauseFrames > 0) {
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
