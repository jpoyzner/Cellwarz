import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Avatar, FLOAT_LEFT_ACTION, FLOAT_RIGHT_ACTION, JUMP_LEFT_ACTION, JUMP_RIGHT_ACTION, LAND_LEFT_ACTION, LAND_RIGHT_ACTION, RUN_LEFT_ACTION, RUN_RIGHT_ACTION, STAND_LEFT_ACTION, STAND_RIGHT_ACTION, START_FLOAT_INTERVAL, START_LAND_INTERVAL } from './avatar';

let count = 0;

const RUN_STEP_DISTANCE = 1;
const JUMP_DISTANCE = 1;

export class Robot extends Avatar {
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

    if (this.xPower !== Physics.NONE) {
      if (this.engine.actionMatchesFrequency(Engine.HALF_STEP)) {
        if (!this.physics.move(this, this.xPower, Physics.NONE, RUN_STEP_DISTANCE)) {
          if (this.facingRight) {
            this.runLeft();
          } else {
            this.runRight();
          }
        }
      }
    } else if (this.slidePower !== Physics.NONE) {
      this.physics.move(this, this.slidePower, Physics.NONE, RUN_STEP_DISTANCE);
      this.slidePower = Physics.NONE;
    }
  }

  override showName(): boolean {
    return false;
  }
}
