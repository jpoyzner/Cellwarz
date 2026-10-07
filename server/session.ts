import type { Avatar } from './sprite/avatar';
import { UI } from './ui';

export const POINTS_PER_BLOCK = 20;

export class Session {
  private avatar: Avatar | undefined;
  private readonly ui: UI;
  private score = 0;

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

  plugin(avatar: Avatar): void {
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
