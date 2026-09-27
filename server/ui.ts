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
        avatar.toggleConnectToStructure();
      } else if (key === 32) {
        avatar.toggleHandleMana();
      } else if (key === 49) {
        avatar.activateManaAction(0, 0);
      } else if (key === 50) {
        avatar.activateManaAction(0, 1);
      } else if (key === 51) {
        avatar.activateManaAction(0, 2);
      }
    } else if (key === 37 || key === 39) {
      avatar.stopRunning();
    } else if (key === 49) {
      avatar.getStructure()?.deactivateManaAction(0, 0);
    } else if (key === 50) {
      avatar.getStructure()?.deactivateManaAction(0, 1);
    } else if (key === 51) {
      avatar.getStructure()?.deactivateManaAction(0, 2);
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
