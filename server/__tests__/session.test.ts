import { describe, expect, it } from 'vitest';
import { POINTS_PER_BLOCK, Session } from '../session';
import { Avatar } from '../sprite/avatar';
import { createTestCell } from './testHelpers';

describe('Session score', () => {
  it('starts at zero and adds 20 points per block, surviving a re-plug into a new avatar', () => {
    const { cell, cellData } = createTestCell(50, 50);
    Avatar.init(cellData);
    const session = new Session(new Avatar('scorer', 10, 10, false, cell));

    expect(session.getScore()).toBe(0);

    session.addBlocks(3);
    expect(session.getScore()).toBe(3 * POINTS_PER_BLOCK);
    expect(POINTS_PER_BLOCK).toBe(20);

    session.plugin(new Avatar('scorer', 20, 10, false, cell));
    expect(session.getScore()).toBe(60);
  });
});

describe('Session diamonds', () => {
  it('starts at zero, counts collected diamonds, and survives a re-plug into a new avatar', () => {
    const { cell, cellData } = createTestCell(50, 50);
    Avatar.init(cellData);
    const session = new Session(new Avatar('collector', 10, 10, false, cell));

    expect(session.getDiamonds()).toBe(0);

    session.addDiamonds(2);
    session.addDiamonds(1);
    session.plugin(new Avatar('collector', 20, 10, false, cell));

    expect(session.getDiamonds()).toBe(3);
  });
});
