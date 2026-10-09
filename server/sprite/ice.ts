import type { CellData } from '../cellData';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Mana } from './mana';
import { DEFAULT_ACTION } from './sprite';
import { addAction } from './frames';

// Cells per frame (one cell every other frame, same pace as the old patrol).
const SLIDE_SPEED = 0.5;

/** The blue block: slides along whatever it rests on and keeps sliding — a wall just stops it, it never turns around. */
export class Ice extends Mana {
  private static readonly actionFrames = new Map<string, Frame[]>();

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'mana/ice/ice', 1, false, Ice.actionFrames);
  }

  getActionFrames(): Map<string, Frame[]> {
    return Ice.actionFrames;
  }

  override getSlideDrive(): number {
    return Physics.RIGHT * SLIDE_SPEED;
  }
}
