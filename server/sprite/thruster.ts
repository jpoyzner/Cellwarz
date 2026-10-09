import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

const REVERSED_ACTION = 'reversed';

/** The yellow block: an ordinary block until an avatar touches or picks it up, after which gravity is reversed for it. */
export class Thruster extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  private reversed = false;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/engine/engine', 1, false, Thruster.actionFrames);
    addAction(cellData, REVERSED_ACTION, 'mana/engine/engineUp', 1, false, Thruster.actionFrames);
  }

  getActionFrames(): Map<string, Frame[]> {
    return Thruster.actionFrames;
  }

  isReversed(): boolean {
    return this.reversed;
  }

  override getGravityDirection(): number {
    return this.reversed ? Physics.UP : Physics.DOWN;
  }

  protected override onTouched(): void {
    if (this.reversed) return;

    this.reversed = true;
    this.setAnimationSequence(REVERSED_ACTION);
    this.needsRedraw(true);
  }
}
