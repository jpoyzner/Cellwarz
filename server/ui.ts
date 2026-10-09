import type { Avatar } from './sprite/avatar';

export class UI {
  private avatar: Avatar | undefined;

  constructor(avatar: Avatar) {
    this.plugin(avatar);
  }

  reactTo(key: number, down: boolean): void {
    if (this.unplugged()) return;
    const avatar = this.avatar!;

    if (down) {
      if (key === 37) {
        avatar.runLeft();
      } else if (key === 38) {
        avatar.attemptJump();
      } else if (key === 39) {
        avatar.runRight();
      } else if (key === 40) {
        avatar.putDownMana();
      } else if (key === 32) {
        if (avatar.hasHandledMana()) avatar.throwMana();
        else avatar.pickUpMana();
      }
    } else if (key === 37 || key === 39) {
      avatar.stopRunning();
    } else if (key === 38) {
      avatar.releaseJump();
    }
  }

  plugin(avatar: Avatar): void {
    this.avatar = avatar;
  }

  unplug(): void {
    this.avatar = undefined;
  }

  unplugged(): boolean {
    return this.avatar === undefined;
  }
}
