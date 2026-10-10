import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar, FULL_JUMP_ACTION_LENGTH } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Ice } from '../sprite/ice';
import { Physics } from '../physics';
import { createTestCell, layFloor } from './testHelpers';

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

  it("adds the avatar's own motion to a throw", () => {
    const throwFrom = (move: (avatar: Avatar) => void) => {
      const { cell } = createTestScene(80, 80);
      layFloor(cell, 34, 0, 60);
      const ice = new Ice(10, 31, false, cell);
      const avatar = new Avatar('mover', 10, 23, false, cell);
      avatar.pickUpMana();
      move(avatar);
      avatar.throwMana();
      return ice['body'];
    };

    const standing = throwFrom(() => {});
    const running = throwFrom((avatar) => {
      avatar.runRight();
      for (let i = 0; i < 4; i++) avatar['doAction']();
    });
    const jumping = throwFrom((avatar) => {
      avatar.attemptJump();
      for (let i = 0; i < 4; i++) avatar['doAction']();
    });

    expect(running.vx).toBeGreaterThan(standing.vx);
    expect(running.vy).toBeCloseTo(standing.vy);
    expect(jumping.vy).toBeLessThan(standing.vy);
  });

  it('picks up a block touching its side without standing on it', () => {
    const { cell } = createTestScene(60, 60);
    layFloor(cell, 30, 0, 60);
    const avatar = new Avatar('beside', 10, 22, false, cell);
    const ice = new Ice(avatar.getClippedX() + avatar.getClippedWidth(), 27, false, cell);

    avatar.pickUpMana();

    expect(ice.isBeingHandled()).toBe(true);
    expect(avatar.hasHandledMana()).toBe(true);
    expect(ice.getY()).toBe(avatar.getY() - ice.getHeight());
  });

  it('picks up the nearest block when touching several', () => {
    const { cell } = createTestScene(60, 60);
    layFloor(cell, 30, 0, 60);
    const avatar = new Avatar('choosy', 20, 22, false, cell);
    const farther = new Ice(avatar.getClippedX() - 1 - 3 + 1, 22, false, cell);
    const nearer = new Ice(avatar.getClippedX() + avatar.getClippedWidth(), 25, false, cell);
    const distanceTo = (ice: Ice) =>
      Math.hypot(
        ice.getX() + ice.getWidth() / 2 - (avatar.getX() + avatar.getWidth() / 2),
        ice.getY() + ice.getHeight() / 2 - (avatar.getY() + avatar.getHeight() / 2),
      );
    expect(distanceTo(nearer)).toBeLessThan(distanceTo(farther));

    avatar.pickUpMana();

    expect(nearer.isBeingHandled()).toBe(true);
    expect(farther.isBeingHandled()).toBe(false);
  });

  it('does not pick up a block it is not touching', () => {
    const { cell } = createTestScene(60, 60);
    layFloor(cell, 30, 0, 60);
    const avatar = new Avatar('far', 10, 22, false, cell);
    const ice = new Ice(avatar.getClippedX() + avatar.getClippedWidth() + 4, 27, false, cell);

    avatar.pickUpMana();

    expect(ice.isBeingHandled()).toBe(false);
    expect(avatar.hasHandledMana()).toBe(false);
  });

  it('leaves a block it cannot lift because the spot over its head is blocked', () => {
    const { cell } = createTestScene(60, 60);
    layFloor(cell, 30, 0, 60);
    layFloor(cell, 20, 0, 60);
    const avatar = new Avatar('cramped', 10, 22, false, cell);
    const ice = new Ice(avatar.getClippedX() + avatar.getClippedWidth(), 27, false, cell);

    avatar.pickUpMana();

    expect(ice.isBeingHandled()).toBe(false);
    expect(avatar.hasHandledMana()).toBe(false);
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

  describe('carrying a block', () => {
    /** An avatar carrying an ice block, standing on a floor with `ceilingY` (if any) laid across the scene. */
    function carrierScene(ceilingY?: number) {
      const { cell, physics } = createTestScene(80, 60);
      layFloor(cell, 40, 0, 80);
      if (ceilingY !== undefined) layFloor(cell, ceilingY, 0, 80);
      const ice = new Ice(10, 37, false, cell);
      const avatar = new Avatar('porter', 10, 32, false, cell);
      avatar.pickUpMana();
      expect(avatar.hasHandledMana()).toBe(true);
      return { cell, physics, avatar, ice };
    }

    it('cannot jump so high that the carried block ends up inside the ceiling', () => {
      const { avatar, ice } = carrierScene(26); // wall rows 26-27: only just room for the avatar plus a block above it

      let highest = Infinity;
      for (let frame = 0; frame < 60; frame++) {
        avatar.attemptJump();
        avatar['doAction']();
        ice['doAction']();
        highest = Math.min(highest, ice.getY());
      }

      expect(highest).toBeGreaterThanOrEqual(28); // never in rows 26-27
      expect(avatar.hasHandledMana()).toBe(true);
    });

    it('cannot run under an overhang the carried block would hit', () => {
      const { cell, avatar, ice } = carrierScene();
      layFloor(cell, 29, 24, 40); // an overhang at the carried block's height (rows 29-31), clear of the avatar (rows 32+)

      avatar.runRight();
      for (let frame = 0; frame < 200; frame++) {
        avatar['doAction']();
        ice['doAction']();
      }

      expect(ice.getX() + ice.getWidth()).toBeLessThanOrEqual(24); // stopped at the overhang, block intact
      expect(avatar.getX()).toBeGreaterThan(15); // after having run up to it
      expect(avatar.hasHandledMana()).toBe(true);
    });

    it('lets go of the block instead of dragging it into a wall when something else shoves it there', () => {
      const { cell, physics, avatar, ice } = carrierScene();
      layFloor(cell, 26, 0, 80); // a ceiling right over the carried block, which the avatar was meant to fit under
      const ceilingBlock = new CellBlock(10, 30, false, cell); // and a block that lands in its spot afterwards
      physics.moveTo(ceilingBlock, 10, 30);

      avatar['doAction']();

      expect(avatar.hasHandledMana()).toBe(false);
      expect(ice.isBeingHandled()).toBe(false);
    });
  });
});
