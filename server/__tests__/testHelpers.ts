import type { Cell } from '../cell/cell';
import { CellData } from '../cellData';
import type { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { addAction } from '../sprite/frames';
import { CellBlock } from '../sprite/cellBlock';
import { Mana } from '../sprite/mana';
import { DEFAULT_ACTION } from '../sprite/sprite';
import type { World } from '../world';

export interface TestCellHandle {
  cell: Cell;
  cellData: CellData;
  physics: Physics;
  world: World;
}

/** A minimal fake Cell/World pair for constructing real sprites without a full randomized Cell.init(). */
export function createTestCell(
  width: number,
  height: number,
  world?: Partial<World>,
  wrapsAtEdges = false,
): TestCellHandle {
  const physics = new Physics();
  const fakeWorld = {
    getPhysics: () => physics,
    getZion: () => ({ getHardlines: () => new Map() }),
    ...world,
  } as unknown as World;
  const cellData = new CellData(width, height, fakeWorld, wrapsAtEdges);
  const fakeEngine = { actionMatchesFrequency: () => true, shouldAnimateFrame: () => false } as unknown as Engine;
  const cell = {
    getCellData: () => cellData,
    getWorld: () => fakeWorld,
    getEngine: () => fakeEngine,
  } as unknown as Cell;

  return { cell, cellData, physics, world: fakeWorld };
}

/** A plain block with none of the colored blocks' special behavior, for testing the shared block physics. */
export class PlainBlock extends Mana {
  private static readonly frames = new Map<string, Frame[]>();

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'test/plain', 1, false, PlainBlock.frames);
  }

  getActionFrames(): Map<string, Frame[]> {
    return PlainBlock.frames;
  }
}

/** Lays a floor of wall blocks along row `y` (grid units), covering `fromX` up to `toX`. */
export function layFloor(cell: Cell, y: number, fromX: number, toX: number): void {
  for (let x = fromX; x < toX; x += CellBlock.SIZE) new CellBlock(x, y, false, cell);
}

/** Lays a column of wall blocks at `x`, covering `fromY` up to `toY`. */
export function layWall(cell: Cell, x: number, fromY: number, toY: number): void {
  for (let y = fromY; y < toY; y += CellBlock.SIZE) new CellBlock(x, y, false, cell);
}
