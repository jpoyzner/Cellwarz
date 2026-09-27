import { describe, expect, it } from 'vitest';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Ice } from '../sprite/ice';
import { createTestCell } from './testHelpers';

function createTestScene(width: number, height: number) {
  const { cell, physics } = createTestCell(width, height);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  Avatar.init(cellData);
  Ice.init(cellData);
  return { cell, physics };
}

describe('Avatar', () => {
  it('runs right or left based on the last input', () => {
    const { cell } = createTestScene(50, 50);
    const avatar = new Avatar('runner', 10, 10, false, cell);

    avatar.runRight();
    avatar['doAction']();
    const xAfterRight = avatar.getX();
    expect(xAfterRight).toBeGreaterThanOrEqual(10);

    avatar.stopRunning();
    avatar.runLeft();
    avatar['doAction']();
    expect(avatar.getX()).toBeLessThan(xAfterRight);
  });

  it('jumps only when touching ground below', () => {
    const { cell } = createTestScene(50, 50);
    new CellBlock(10, 20, false, cell);
    const grounded = new Avatar('grounded', 10, 12, false, cell);
    const airborne = new Avatar('airborne', 10, 0, false, cell);

    grounded.attemptJump();
    airborne.attemptJump();

    // Jumping moves the avatar upward on the next physics tick; the airborne one just keeps falling.
    const groundedYBefore = grounded.getY();
    const airborneYBefore = airborne.getY();
    grounded['doAction']();
    airborne['doAction']();

    expect(grounded.getY()).toBeLessThan(groundedYBefore);
    expect(airborne.getY()).toBeGreaterThan(airborneYBefore);
  });

  it('picks up and sets down a mana block beneath it', () => {
    const { cell } = createTestScene(50, 50);
    const ice = new Ice(10, 20, false, cell);
    const avatar = new Avatar('handler', 10, 12, false, cell);

    expect(ice.isBeingHandled()).toBe(false);

    avatar.toggleHandleMana();
    expect(ice.isBeingHandled()).toBe(true);

    avatar.toggleHandleMana();
    expect(ice.isBeingHandled()).toBe(false);
  });

  it('dies and removes itself permanently', () => {
    const { cell } = createTestScene(50, 50);
    const avatar = new Avatar('mortal', 10, 10, false, cell);

    expect(avatar.removed()).toBe(false);
    avatar.die();
    expect(avatar.removed()).toBe(true);
  });
});
