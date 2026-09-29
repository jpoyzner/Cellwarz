import type { CellData } from '../cellData';
import type { Cell } from '../cell/cell';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Entrance } from './entrance';
import { addAction } from './frames';

const IDLE_ACTION = 'idle';

/** Small circular portal that hovers off the ground; avatars deposited here (login/warp-arrival) drop
 * a short distance under gravity before landing, rather than appearing already standing on solid ground. */
export class SpawnPortal extends Entrance {
  static readonly WIDTH = 4;
  static readonly HEIGHT = 4;

  private static readonly actionFrames = new Map<string, Frame[]>();

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    super(x, y, cellInit, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return SpawnPortal.actionFrames;
  }

  static init(cellData: CellData): void {
    addAction(cellData, IDLE_ACTION, 'doors/entrance/idle', 6, false, SpawnPortal.actionFrames);
  }

  protected override getDefaultAction(): string {
    return IDLE_ACTION;
  }

  getWidth(): number {
    return SpawnPortal.WIDTH;
  }

  getHeight(): number {
    return SpawnPortal.HEIGHT;
  }

  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  protected override animate(): boolean {
    return true;
  }

  override getAnimationFrequency(): number {
    return 12;
  }

  // Deposits the avatar right at the portal itself (not resting on ground) so the placement gap built
  // into the room layout (see MainRoom) is what makes the avatar visibly drop when it emerges.
  protected getEntranceXOffset(): number {
    return -1;
  }

  protected getEntranceYOffset(): number {
    return SpawnPortal.HEIGHT;
  }

  override getMass(): number {
    return 0;
  }

  override isStable(): boolean {
    return true;
  }
}
