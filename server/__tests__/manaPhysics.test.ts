import { describe, expect, it } from 'vitest';
import { Physics } from '../physics';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Ice } from '../sprite/ice';
import { Thruster } from '../sprite/thruster';
import { createTestCell, layFloor, layWall, PlainBlock } from './testHelpers';

const FLOOR_Y = 100;

function createScene() {
  const { cell, physics } = createTestCell(120, 120);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  Avatar.init(cellData);
  PlainBlock.init(cellData);
  Ice.init(cellData);
  Thruster.init(cellData);
  layFloor(cell, FLOOR_Y, 0, 120);
  return { cell, physics };
}

/** Drops a block from `height` cells above the floor and reports how high its first rebound reached. */
function firstReboundHeight(height: number): number {
  const { cell } = createScene();
  const restingY = FLOOR_Y - PlainBlock.SIZE;
  const block = new PlainBlock(30, restingY - height, false, cell);

  let landed = false;
  let highest = restingY;
  for (let frame = 0; frame < 600; frame++) {
    block['doAction']();
    if (!landed && block.getY() === restingY) landed = true;
    else if (landed) highest = Math.min(highest, block.getY());
    if (landed && frame > 5 && block.getY() === restingY && highest < restingY) break;
  }

  return restingY - highest;
}

describe('block physics', () => {
  it('lets an avatar shove a block, which keeps sliding a little and then stops', () => {
    const { cell, physics } = createScene();
    const block = new PlainBlock(30, FLOOR_Y - PlainBlock.SIZE, false, cell);
    const avatar = new Avatar('pusher', 30 - Avatar.WIDTH + 1, FLOOR_Y - Avatar.HEIGHT, false, cell);

    expect(physics.move(avatar, Physics.RIGHT, Physics.NONE, 1)).toBe(true);
    expect(block.getX()).toBe(31);
    const pushedTo = block.getX();

    for (let frame = 0; frame < 120; frame++) block['doAction']();
    const settledAt = block.getX();

    expect(settledAt).toBeGreaterThan(pushedTo + 1);
    expect(settledAt).toBeLessThan(pushedTo + 12);

    for (let frame = 0; frame < 60; frame++) block['doAction']();
    expect(block.getX()).toBe(settledAt);
  });

  it('keeps blocks that are pushed against a wall in place', () => {
    const { cell, physics } = createScene();
    layWall(cell, 34, FLOOR_Y - 10, FLOOR_Y);
    const block = new PlainBlock(31, FLOOR_Y - PlainBlock.SIZE, false, cell);
    const avatar = new Avatar('stuck', 26, FLOOR_Y - Avatar.HEIGHT, false, cell);

    expect(physics.move(avatar, Physics.RIGHT, Physics.NONE, 1)).toBe(false);
    for (let i = 0; i < 40; i++) block['doAction']();

    expect(block.getX()).toBe(31);
  });

  it('bounces after falling and hits something, higher the higher it fell from', () => {
    const lowDrop = firstReboundHeight(4);
    const mediumDrop = firstReboundHeight(20);
    const highDrop = firstReboundHeight(60);

    expect(lowDrop).toBe(0);
    expect(mediumDrop).toBeGreaterThan(0);
    expect(highDrop).toBeGreaterThan(mediumDrop);
    // "A little bit": a bounce is always much smaller than the fall that caused it.
    expect(highDrop).toBeLessThan(60 / 2);
  });

  it('settles after bouncing instead of hopping forever', () => {
    const { cell } = createScene();
    const restingY = FLOOR_Y - PlainBlock.SIZE;
    const block = new PlainBlock(30, restingY - 60, false, cell);

    for (let frame = 0; frame < 600; frame++) block['doAction']();
    expect(block.getY()).toBe(restingY);

    const rested = block.getY();
    for (let frame = 0; frame < 30; frame++) {
      block['doAction']();
      expect(block.getY()).toBe(rested);
    }
  });

  it('has a block that is pushed from underneath launched upward', () => {
    const { cell, physics } = createScene();
    const block = new PlainBlock(30, 60, false, cell);
    const avatar = new Avatar('header', 30, 60 + PlainBlock.SIZE, false, cell);

    physics.move(avatar, Physics.NONE, Physics.UP, 1);
    let highest = block.getY();
    for (let frame = 0; frame < 20; frame++) {
      block['doAction']();
      highest = Math.min(highest, block.getY());
    }

    expect(highest).toBeLessThan(60 - 1);
  });

  describe('blue ice', () => {
    it('keeps sliding along the floor at a steady pace', () => {
      const { cell } = createScene();
      const ice = new Ice(20, FLOOR_Y - Ice.SIZE, false, cell);

      for (let frame = 0; frame < 40; frame++) ice['doAction']();

      expect(ice.getX()).toBeGreaterThanOrEqual(20 + 15);
    });

    it('turns around when a wall blocks it, so it never stops sliding', () => {
      const { cell } = createScene();
      layWall(cell, 50, FLOOR_Y - 10, FLOOR_Y);
      layWall(cell, 20, FLOOR_Y - 10, FLOOR_Y);
      const ice = new Ice(30, FLOOR_Y - Ice.SIZE, false, cell);

      const xs: number[] = [];
      for (let frame = 0; frame < 400; frame++) {
        ice['doAction']();
        xs.push(ice.getX());
      }

      expect(Math.max(...xs)).toBe(50 - Ice.SIZE);
      expect(Math.min(...xs)).toBeLessThanOrEqual(20 + CellBlock.SIZE + 1);
      // Still moving at the end: the last stretch isn't a standstill.
      expect(new Set(xs.slice(-10)).size).toBeGreaterThan(1);
    });
  });

  describe('yellow thruster', () => {
    it('is an ordinary block until touched', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, 80, false, cell);

      for (let frame = 0; frame < 120; frame++) thruster['doAction']();

      expect(thruster.isReversed()).toBe(false);
      expect(thruster.getY()).toBe(FLOOR_Y - Thruster.SIZE);
    });

    it('falls upwards once an avatar touches it', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const avatar = new Avatar('toucher', 32, FLOOR_Y - Avatar.HEIGHT, false, cell);

      avatar['doAction']();
      expect(thruster.isReversed()).toBe(true);

      for (let frame = 0; frame < 60; frame++) thruster['doAction']();
      expect(thruster.getY()).toBeLessThan(FLOOR_Y - Thruster.SIZE - 10);
    });

    it('reverses when picked up, and falls upwards once set back down', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const avatar = new Avatar('carrier', 30, FLOOR_Y - Thruster.SIZE - Avatar.HEIGHT, false, cell);

      avatar.pickUpMana();
      expect(thruster.isReversed()).toBe(true);

      avatar.throwMana();
      const yAfterThrow = thruster.getY();
      for (let frame = 0; frame < 80; frame++) thruster['doAction']();

      expect(thruster.getY()).toBeLessThan(yAfterThrow);
    });

    it('falls upwards only faintly compared with how a normal block falls', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const faller = new PlainBlock(60, 20, false, cell);
      thruster.touch();

      for (let frame = 0; frame < 40; frame++) {
        thruster['doAction']();
        faller['doAction']();
      }

      const rose = FLOOR_Y - Thruster.SIZE - thruster.getY();
      const fell = faller.getY() - 20;
      expect(rose).toBeGreaterThan(2);
      expect(rose).toBeLessThan(fell / 3);
    });

    it('lets an avatar glide upwards while carrying it, and an inactive one does nothing of the sort', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const carrier = new Avatar('glider', 30, FLOOR_Y - Thruster.SIZE - Avatar.HEIGHT, false, cell);
      const bystander = new Avatar('bystander', 80, FLOOR_Y - Avatar.HEIGHT, false, cell);
      const startY = FLOOR_Y - Thruster.SIZE - Avatar.HEIGHT;

      carrier.pickUpMana();
      expect(thruster.isReversed()).toBe(true);
      expect(carrier.hasHandledMana()).toBe(true);

      let previousY = carrier.getY();
      for (let frame = 0; frame < 60; frame++) {
        carrier['doAction']();
        thruster['doAction']();
        bystander['doAction']();
        expect(carrier.getY()).toBeLessThanOrEqual(previousY); // never sinks back while carrying
        previousY = carrier.getY();
      }

      expect(carrier.getY()).toBeLessThan(startY - 15);
      expect(bystander.getY()).toBe(FLOOR_Y - Avatar.HEIGHT);
    });

    it('stops lifting an avatar once the block is put down away from it', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const carrier = new Avatar('dropper', 30, FLOOR_Y - Thruster.SIZE - Avatar.HEIGHT, false, cell);
      carrier.pickUpMana();
      for (let frame = 0; frame < 30; frame++) {
        carrier['doAction']();
        thruster['doAction']();
      }

      carrier.throwMana();
      const risenTo = carrier.getY();
      for (let frame = 0; frame < 60; frame++) {
        thruster['doAction']();
        carrier['doAction']();
      }

      expect(carrier.getY()).toBeGreaterThan(risenTo); // free to fall again
    });

    it('makes a block resting against it much lighter, so it drifts up with it', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const neighbour = new PlainBlock(33, FLOOR_Y - PlainBlock.SIZE, false, cell);
      thruster.touch();

      for (let frame = 0; frame < 40; frame++) {
        thruster['doAction']();
        neighbour['doAction']();
      }

      expect(neighbour.getY()).toBeLessThan(FLOOR_Y - PlainBlock.SIZE - 2);
    });

    it('falls back down (its reversed gravity switches off) once it hits the underside of a wall block', () => {
      const { cell } = createScene();
      layFloor(cell, 20, 0, 120);
      const thruster = new Thruster(30, 70, false, cell);
      thruster.touch();
      expect(thruster.isReversed()).toBe(true);

      let reachedCeiling = false;
      for (let frame = 0; frame < 400; frame++) {
        thruster['doAction']();
        if (thruster.getY() === 22) reachedCeiling = true;
      }

      expect(reachedCeiling).toBe(true);
      expect(thruster.isReversed()).toBe(false);
      expect(thruster.getY()).toBe(FLOOR_Y - Thruster.SIZE); // back on the floor, for good
    });

    it('does not rise again just because an avatar stands beside it, but does once it is picked up', () => {
      const { cell } = createScene();
      layFloor(cell, 20, 0, 120);
      const thruster = new Thruster(30, 70, false, cell);
      thruster.touch();
      for (let frame = 0; frame < 400; frame++) thruster['doAction']();
      expect(thruster.getY()).toBe(FLOOR_Y - Thruster.SIZE);

      const avatar = new Avatar('neighbour', 32, FLOOR_Y - Avatar.HEIGHT, false, cell);
      for (let frame = 0; frame < 60; frame++) {
        avatar['doAction']();
        thruster['doAction']();
      }
      expect(thruster.isReversed()).toBe(false);

      avatar.pickUpMana();
      expect(thruster.isReversed()).toBe(true);
    });

    it('keeps its upward gravity while carried, even by an avatar pressed against a ceiling', () => {
      const { cell } = createScene();
      layFloor(cell, 20, 0, 120);
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const carrier = new Avatar('holder', 30, FLOOR_Y - Thruster.SIZE - Avatar.HEIGHT, false, cell);
      carrier.pickUpMana();

      for (let frame = 0; frame < 400; frame++) {
        carrier['doAction']();
        thruster['doAction']();
      }

      expect(carrier.getY()).toBeLessThan(40); // glided right up under the ceiling
      expect(thruster.isReversed()).toBe(true);
    });

    it('turns its upward gravity off at the ceiling after being thrown up there', () => {
      const { cell } = createScene();
      layFloor(cell, 20, 0, 120);
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const carrier = new Avatar('thrower', 30, FLOOR_Y - Thruster.SIZE - Avatar.HEIGHT, false, cell);
      carrier.pickUpMana();
      for (let frame = 0; frame < 30; frame++) {
        carrier['doAction']();
        thruster['doAction']();
      }
      expect(thruster.isReversed()).toBe(true);

      carrier.throwMana();
      for (let frame = 0; frame < 400; frame++) thruster['doAction']();

      expect(thruster.isReversed()).toBe(false);
    });

    it('keeps rising while something other than a wall block is above it', () => {
      const { cell } = createScene();
      const thruster = new Thruster(30, FLOOR_Y - Thruster.SIZE, false, cell);
      const lid = new PlainBlock(30, 60, false, cell); // light enough to be shoved up, but let it rest on a ceiling
      layFloor(cell, 52, 0, 120);
      thruster.touch();

      for (let frame = 0; frame < 300; frame++) {
        thruster['doAction']();
        lid['doAction']();
      }

      expect(thruster.isReversed()).toBe(true);
    });
  });
});
