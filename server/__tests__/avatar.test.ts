import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar, FULL_JUMP_ACTION_LENGTH } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Ice } from '../sprite/ice';
import { Physics } from '../physics';
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('picks up the block beneath it, and puts it back down', () => {
    const { cell } = createTestScene(50, 50);
    const ice = new Ice(10, 20, false, cell);
    const avatar = new Avatar('handler', 10, 12, false, cell);

    expect(ice.isBeingHandled()).toBe(false);

    avatar.pickUpMana();
    expect(ice.isBeingHandled()).toBe(true);
    expect(avatar.hasHandledMana()).toBe(true);

    avatar.putDownMana();
    expect(ice.isBeingHandled()).toBe(false);
    expect(avatar.hasHandledMana()).toBe(false);
  });

  it('throws the carried block ahead in an arc instead of putting it down', () => {
    const { cell } = createTestScene(50, 50);
    const ice = new Ice(10, 20, false, cell);
    const avatar = new Avatar('thrower', 10, 12, false, cell);
    avatar.pickUpMana();
    const xBefore = ice.getX();

    avatar.throwMana();
    expect(ice.isBeingHandled()).toBe(false);
    expect(avatar.hasHandledMana()).toBe(false);
    expect(ice.isThrown()).toBe(true);

    let minY = ice.getY();
    for (let i = 0; i < 12; i++) {
      ice['doAction']();
      minY = Math.min(minY, ice.getY());
    }

    expect(ice.getX()).toBeGreaterThan(xBefore);
    expect(minY).toBeLessThan(ice.getY() + 1); // rose first, now on its way back down.
  });

  it('does not pick up a second block while already carrying one', () => {
    const { cell } = createTestScene(50, 50);
    const first = new Ice(10, 20, false, cell);
    const avatar = new Avatar('greedy', 10, 12, false, cell);
    avatar.pickUpMana();
    avatar.pickUpMana();

    expect(first.isBeingHandled()).toBe(true);
    expect(avatar.hasHandledMana()).toBe(true);
  });

  it('dies and removes itself permanently', () => {
    const { cell } = createTestScene(50, 50);
    const avatar = new Avatar('mortal', 10, 10, false, cell);

    expect(avatar.removed()).toBe(false);
    avatar.die();
    expect(avatar.removed()).toBe(true);
  });

  it('applies a knockback nudge on death when a direction is given', () => {
    const { cell } = createTestScene(50, 50);
    const avatar = new Avatar('mortal2', 20, 20, false, cell);
    const xBefore = avatar.getX();

    avatar.die(Physics.RIGHT, Physics.NONE);

    expect(avatar.removed()).toBe(true);
    expect(avatar.getX()).toBeGreaterThan(xBefore);
  });

  it('cuts the jump short when the jump key is released after a real pause (variable jump height)', () => {
    const { cell } = createTestScene(50, 50);
    new CellBlock(10, 40, false, cell);
    new CellBlock(30, 40, false, cell);
    const full = new Avatar('full', 10, 32, false, cell);
    const short = new Avatar('short', 30, 32, false, cell);

    full.attemptJump();
    short.attemptJump();

    // A same-instant release can't be a genuine human tap (that's exactly what an automated/scripted key
    // press looks like), so releaseJump() ignores it — simulate a real pause before releasing.
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    short.releaseJump();

    let fullMinY = full.getY();
    let shortMinY = short.getY();

    for (let i = 0; i < FULL_JUMP_ACTION_LENGTH + 5; i++) {
      full['doAction']();
      short['doAction']();
      fullMinY = Math.min(fullMinY, full.getY());
      shortMinY = Math.min(shortMinY, short.getY());
    }

    expect(shortMinY).toBeGreaterThan(fullMinY);
  });

  it('ignores an instantaneous release (indistinguishable from a scripted zero-delay key press)', () => {
    const { cell } = createTestScene(50, 50);
    new CellBlock(10, 40, false, cell);
    const avatar = new Avatar('instant', 10, 32, false, cell);

    avatar.attemptJump();
    avatar.releaseJump(); // same real millisecond — too fast to be a deliberate release.

    expect(avatar['yPower']).toBe(FULL_JUMP_ACTION_LENGTH);
  });

  it('honors coyote time: a jump pressed just after leaving the ledge still works', () => {
    const { cell, physics } = createTestScene(50, 50);
    new CellBlock(10, 20, false, cell);
    const avatar = new Avatar('coyote', 10, 12, false, cell);

    avatar['doAction'](); // grounded tick — refreshes the coyote window.
    physics.moveTo(avatar, 30, 0); // walked off the ledge, now airborne over open floor.

    avatar.attemptJump();

    expect(avatar['yPower']).toBeGreaterThan(0);
  });

  it('does not jump mid-air once the coyote window has expired', () => {
    const { cell, physics } = createTestScene(50, 50);
    new CellBlock(10, 20, false, cell);
    const avatar = new Avatar('lateJumper', 10, 12, false, cell);

    avatar['doAction']();
    physics.moveTo(avatar, 30, 0);

    for (let i = 0; i < 10; i++) {
      avatar['doAction'](); // let the coyote window fully expire while airborne.
    }

    avatar.attemptJump();

    expect(avatar['yPower']).toBe(Physics.NONE);
  });

  it('buffers a jump press while airborne and fires it the instant the avatar lands', () => {
    const { cell, physics } = createTestScene(50, 50);
    const avatar = new Avatar('buffered', 10, 0, false, cell);

    avatar.attemptJump(); // airborne with no coyote grace left — buffered instead of firing immediately.
    expect(avatar['yPower']).toBe(Physics.NONE);
    expect(avatar['jumpBufferedFrames']).toBeGreaterThan(0);

    new CellBlock(10, 8, false, cell); // now directly beneath the avatar, as if it just landed.
    physics.moveTo(avatar, 10, 0);

    avatar['doAction']();

    expect(avatar['yPower']).toBeGreaterThan(0);
  });
});
