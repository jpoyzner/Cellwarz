import { describe, expect, it } from 'vitest';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Robot } from '../sprite/robot';
import { createTestCell } from './testHelpers';

function createTestScene(width: number, height: number) {
  const { cell, physics } = createTestCell(width, height);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  Avatar.init(cellData);
  return { cell, physics };
}

describe('Robot', () => {
  it('starts running right by default', () => {
    const { cell } = createTestScene(50, 50);
    const robot = new Robot(10, 10, false, cell);

    const xBefore = robot.getX();
    robot['doAction']();

    expect(robot.getX()).toBeGreaterThanOrEqual(xBefore);
  });

  it('turns around and runs the other way after hitting an obstacle', () => {
    const { cell } = createTestScene(50, 50);
    new CellBlock(10, 30, false, cell);
    new CellBlock(12, 30, false, cell);
    new CellBlock(14, 30, false, cell);
    new CellBlock(16, 30, false, cell);
    new CellBlock(20, 20, false, cell); // wall directly to the right of the robot's path.
    new CellBlock(20, 22, false, cell);
    const robot = new Robot(10, 22, false, cell);

    for (let i = 0; i < 40; i++) {
      robot['doAction']();
    }

    expect(robot['facingRight']).toBe(false);
    expect(robot['xPower']).toBeLessThan(0); // running left now.
  });

  it('keeps patrolling back and forth between two walls indefinitely', () => {
    const { cell } = createTestScene(50, 50);
    for (let x = 10; x <= 18; x += 2) {
      new CellBlock(x, 30, false, cell); // floor.
    }
    new CellBlock(6, 20, false, cell); // left wall.
    new CellBlock(6, 22, false, cell);
    new CellBlock(20, 20, false, cell); // right wall.
    new CellBlock(20, 22, false, cell);
    const robot = new Robot(10, 22, false, cell);

    const xs: number[] = [];
    for (let i = 0; i < 300; i++) {
      robot['doAction']();
      xs.push(robot.getX());
    }

    // Bounded between the two walls (never stuck permanently against either one) and still moving late on.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(18);
    expect(new Set(xs.slice(-20)).size).toBeGreaterThan(1);
  });
});
