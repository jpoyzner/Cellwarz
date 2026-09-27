import { describe, expect, it } from 'vitest';
import { Physics } from '../physics';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { createTestCell } from './testHelpers';

function createTestScene(width: number, height: number) {
  const { cell, physics } = createTestCell(width, height);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  Avatar.init(cellData);
  return { cell, physics };
}

describe('Physics', () => {
  it('blocks movement into a stable CellBlock', () => {
    const { cell, physics } = createTestScene(50, 50);
    new CellBlock(20, 20, false, cell);
    const avatar = new Avatar('tester', 10, 20, false, cell);

    const moved = physics.move(avatar, Physics.RIGHT, Physics.NONE, 20);

    expect(moved).toBe(false);
    expect(avatar.getX()).toBeLessThan(20);
  });

  it('lets a sprite gravitate downward when nothing is below it', () => {
    const { cell, physics } = createTestScene(50, 50);
    const avatar = new Avatar('faller', 10, 10, false, cell);

    const fell = physics.gravitate(avatar);

    expect(fell).toBe(true);
    expect(avatar.getY()).toBeGreaterThan(10);
  });

  it('stops a sprite from falling through a stable CellBlock beneath it', () => {
    const { cell, physics } = createTestScene(50, 50);
    new CellBlock(10, 20, false, cell);
    const avatar = new Avatar('lander', 10, 10, false, cell);

    for (let i = 0; i < 10; i++) {
      physics.gravitate(avatar);
    }

    expect(avatar.getY()).toBe(12);
  });
});
