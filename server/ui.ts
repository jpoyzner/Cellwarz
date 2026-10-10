import type { Avatar } from './sprite/avatar';

// Pressing Escape while alive puts the avatar to sleep and leaves the player spectating (the client sends it).
export const ESCAPE_KEY = 27;

const SPACE_KEY = 32;

export class UI {
  private avatar: Avatar | undefined;

  constructor(avatar: Avatar) {
    this.plugin(avatar);
  }

  reactTo(key: number, down: boolean): void {
    if (this.unplugged()) return;
    const avatar = this.avatar!;
    if (avatar.isSleeping()) {
      // The player is only spectating (or gone): the avatar takes no orders, except Space, which wakes it up.
      if (down && key === SPACE_KEY) avatar.wakeUp();
      return;
    }

    if (down) {
      if (key === 37) {
        avatar.runLeft();
      } else if (key === 38) {
        avatar.attemptJump();
      } else if (key === 39) {
        avatar.runRight();
      } else if (key === 40) {
        avatar.putDownMana();
      } else if (key === ESCAPE_KEY) {
        avatar.fallAsleep();
      } else if (key === SPACE_KEY) {
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
