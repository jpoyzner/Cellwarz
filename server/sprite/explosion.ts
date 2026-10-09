import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { DEFAULT_ACTION, Sprite } from './sprite';
import { addAction } from './frames';

const FRAME_COUNT = 6;
const FRAMES_PER_IMAGE = 3;

/** A short purely visual fireball (the kill and the shove are done by whatever spawned it). */
export class Explosion extends Sprite {
  static readonly SIZE = 28;

  private static readonly actionFrames = new Map<string, Frame[]>();

  private age = 0;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'effects/explosion/explosion', FRAME_COUNT, false, Explosion.actionFrames);
  }

  constructor(x: number, y: number, cell: Cell) {
    super(x, y, false, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return Explosion.actionFrames;
  }

  getWidth(): number {
    return Explosion.SIZE;
  }

  getHeight(): number {
    return Explosion.SIZE;
  }

  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  override getMass(): number {
    return 0;
  }

  override melts(): boolean {
    return true;
  }

  override isStable(): boolean {
    return true;
  }

  protected override doAction(): void {
    this.age++;

    if (this.age >= FRAME_COUNT * FRAMES_PER_IMAGE) {
      this.removePermanently();
      return;
    }

    this.setFrame(Math.floor(this.age / FRAMES_PER_IMAGE));
    this.needsRedraw(true);
  }
}
