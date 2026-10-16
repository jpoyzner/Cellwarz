import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Sprite } from './sprite';
import { addAction } from './frames';
import type { Avatar } from './avatar';

const IDLE_ACTION = 'idle';

/** A "stargate" transporter, a little bigger than an avatar: an avatar standing in it that presses Up is beamed up
 * (see Avatar.beamUpFromPortal) and relocated to a random room's entrance (see warpRandomly), so it can be walked past.
 * Always active (no open/closed states). The client draws it as the same glowing pad the login screen uses. */
export class Portal extends Sprite {
  static readonly WIDTH = 8;
  static readonly HEIGHT = 8;

  private static readonly actionFrames = new Map<string, Frame[]>();

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return Portal.actionFrames;
  }

  static init(cellData: CellData): void {
    addAction(cellData, IDLE_ACTION, 'doors/stargate/idle', 8, false, Portal.actionFrames);
  }

  protected override getDefaultAction(): string {
    return IDLE_ACTION;
  }

  getWidth(): number {
    return Portal.WIDTH;
  }

  getHeight(): number {
    return Portal.HEIGHT;
  }

  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  protected override animate(): boolean {
    return true;
  }

  override getAnimationFrequency(): number {
    return 8;
  }

  override getMass(): number {
    return 0;
  }

  override isStable(): boolean {
    return true;
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
