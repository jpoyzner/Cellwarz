import type { Cell } from '../cell/cell';
import { CellData } from '../cellData';
import type { Engine } from '../engine';
import { Physics } from '../physics';
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
