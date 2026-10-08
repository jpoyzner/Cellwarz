import type { Avatar } from './sprite/avatar';
import type { Robot } from './sprite/robot';
import { UI } from './ui';

export const POINTS_PER_BLOCK = 20;

export class Session {
  private avatar: Avatar | undefined;
  private readonly ui: UI;
  private score = 0;
  /** The robot this player's body was turned into by a robot's touch; their client keeps watching it. */
  private robotBody: Robot | undefined;

  constructor(avatar: Avatar) {
    this.avatar = avatar;
    avatar.setSession(this);
    this.ui = new UI(avatar);
  }

  getUI(): UI {
    return this.ui;
  }

  getScore(): number {
    return this.score;
  }

  addBlocks(blocks: number): void {
    this.score += blocks * POINTS_PER_BLOCK;
  }

  getAvatar(): Avatar | undefined {
    return this.avatar;
  }

  /** The live robot this player became (undefined once it is destroyed, or after they take a new avatar). */
  getRobotBody(): Robot | undefined {
    return this.robotBody?.removed() ? undefined : this.robotBody;
  }

  setRobotBody(robot: Robot): void {
    this.robotBody = robot;
  }

  plugin(avatar: Avatar): void {
    this.robotBody = undefined;
    if (this.avatar) {
      this.avatar.setManaDown();
      this.avatar.removePermanently();
    }

    this.avatar = avatar;
    this.ui.plugin(avatar);
  }

  unplugged(): boolean {
    return this.avatar === undefined;
  }

  unplug(): void {
    this.avatar?.setManaDown(); // TODO: will crash if someone kills you while you hold something (kept from original Java implementation).
    this.avatar = undefined;
    this.ui.unplug();
  }
}
