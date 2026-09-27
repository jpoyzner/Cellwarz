import type { Cell } from '../cell/cell';
import { CryogenicDoor } from './cryogenicDoor';
import type { Avatar } from './avatar';

export class Portal extends CryogenicDoor {
  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
  }

  warpRandomly(avatar: Avatar): void {
    const zion = this.cell.getWorld().getZion();
    // TODO: not sure why but if I use avatar.getSession() it causes NPEs (kept from original Java implementation).
    const hardline = zion.getHardlines().get(avatar.getName());
    const newAvatar = zion.getRandomEngine().getCell().addAvatarAtEntrance(avatar.getName());
    if (hardline && newAvatar) {
      hardline.plugin(newAvatar);
    }
    zion.loginNeedsRefresh(avatar.getName());
  }
}
