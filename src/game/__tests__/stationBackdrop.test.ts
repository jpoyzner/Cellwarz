import { describe, expect, it } from 'vitest';
import { shipX, StationBackdrop } from '../stationBackdrop';

function makeSeeded(seed = 7): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('StationBackdrop', () => {
  it('keeps ship traffic gliding in both directions and wrapping around the screen', () => {
    const backdrop = new StationBackdrop(1200, 800, makeSeeded());
    expect(backdrop.ships.some((ship) => ship.speed > 0)).toBe(true);
    expect(backdrop.ships.some((ship) => ship.speed < 0)).toBe(true);

    const ship = { y: 100, speed: 0.1, phase: 0.5, length: 40, color: '#00f6ff' };
    for (const now of [0, 5000, 123456, 99999999]) {
      const x = shipX(ship, 1200, now);
      expect(x).toBeGreaterThanOrEqual(-160);
      expect(x).toBeLessThan(1200 + 160);
    }
    expect(shipX({ ...ship, speed: -0.1 }, 1200, 1000)).toBeGreaterThanOrEqual(-160);
  });
});
