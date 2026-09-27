import { describe, expect, it } from 'vitest';
import type { Cell } from '../cell/cell';
import { CellData } from '../cellData';
import type { Engine } from '../engine';
import { Physics } from '../physics';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import type { World } from '../world';

function createTestCell(width: number, height: number) {
  const physics = new Physics();
  const fakeWorld = { getPhysics: () => physics } as unknown as World;
  const cellData = new CellData(width, height, fakeWorld);
  const fakeEngine = { actionMatchesFrequency: () => true, shouldAnimateFrame: () => false } as unknown as Engine;
  const cell = {
    getCellData: () => cellData,
    getWorld: () => fakeWorld,
    getEngine: () => fakeEngine,
  } as unknown as Cell;

  CellBlock.init(cellData);
  Avatar.init(cellData);

  return { cell, physics };
}

describe('Physics', () => {
  it('blocks movement into a stable CellBlock', () => {
    const { cell, physics } = createTestCell(50, 50);
    new CellBlock(20, 20, false, cell);
    const avatar = new Avatar('tester', 10, 20, false, cell);

    const moved = physics.move(avatar, Physics.RIGHT, Physics.NONE, 20);

    expect(moved).toBe(false);
    expect(avatar.getX()).toBeLessThan(20);
  });

  it('lets a sprite gravitate downward when nothing is below it', () => {
    const { cell, physics } = createTestCell(50, 50);
    const avatar = new Avatar('faller', 10, 10, false, cell);

    const fell = physics.gravitate(avatar);

    expect(fell).toBe(true);
    expect(avatar.getY()).toBeGreaterThan(10);
  });

  it('stops a sprite from falling through a stable CellBlock beneath it', () => {
    const { cell, physics } = createTestCell(50, 50);
    new CellBlock(10, 20, false, cell);
    const avatar = new Avatar('lander', 10, 10, false, cell);

    for (let i = 0; i < 10; i++) {
      physics.gravitate(avatar);
    }

    expect(avatar.getY()).toBe(12);
  });
});
