import { describe, expect, it } from 'vitest';
import { Physics } from '../physics';
import { Missile } from '../sprite/missile';
import { createTestCell } from './testHelpers';

function createScene(wrapsAtEdges: boolean) {
  const { cell, cellData } = createTestCell(30, 20, undefined, wrapsAtEdges);
  Missile.init(cellData);
  return cell;
}

describe('Missile', () => {
  it('flies in its direction', () => {
    const cell = createScene(false);
    const missile = new Missile(10, 10, Physics.RIGHT, cell);

    missile['doAction']();
    missile['doAction']();

    expect(missile.getX()).toBe(12);
    expect(missile.removed()).toBe(false);
  });

  for (const [name, direction, startX] of [
    ['right', Physics.RIGHT, 24],
    ['left', Physics.LEFT, 5],
  ] as const) {
    it(`ends at the ${name} edge of a room that wraps, instead of wrapping around to the other side`, () => {
      const cell = createScene(true);
      const missile = new Missile(startX, 10, direction, cell);
      const xs: number[] = [];

      for (let i = 0; i < 20 && !missile.removed(); i++) {
        missile['doAction']();
        xs.push(missile.getX());
      }

      expect(missile.removed()).toBe(true);
      // Never reappeared on the far side: x only ever moved one step at a time in its own direction.
      xs.forEach((x, i) => expect(Math.abs(x - (i === 0 ? startX : xs[i - 1]))).toBeLessThanOrEqual(1));
      expect(direction === Physics.RIGHT ? Math.max(...xs) : Math.min(...xs)).toBe(direction === Physics.RIGHT ? 28 : 0);
    });
  }
});
