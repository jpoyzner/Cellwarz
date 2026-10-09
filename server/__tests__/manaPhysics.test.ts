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

    it('does not turn around when it hits a wall, it just stays against it', () => {
      const { cell } = createScene();
      layWall(cell, 50, FLOOR_Y - 10, FLOOR_Y);
      const ice = new Ice(30, FLOOR_Y - Ice.SIZE, false, cell);

      const xs: number[] = [];
      for (let frame = 0; frame < 200; frame++) {
        ice['doAction']();
        xs.push(ice.getX());
      }

      expect(xs[xs.length - 1]).toBe(50 - Ice.SIZE);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
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

    it('bounces off the ceiling it falls into', () => {
      const { cell } = createScene();
      layFloor(cell, 20, 0, 120);
      const thruster = new Thruster(30, 70, false, cell);
      thruster.touch();

      let lowestAfterCeiling = 0;
      let reachedCeiling = false;
      for (let frame = 0; frame < 300; frame++) {
        thruster['doAction']();
        if (thruster.getY() === 22) reachedCeiling = true;
        if (reachedCeiling) lowestAfterCeiling = Math.max(lowestAfterCeiling, thruster.getY());
      }

      expect(reachedCeiling).toBe(true);
      expect(thruster.getY()).toBe(22);
      expect(lowestAfterCeiling).toBeGreaterThan(22);
      expect(lowestAfterCeiling).toBeLessThan(40);
    });
  });
});
