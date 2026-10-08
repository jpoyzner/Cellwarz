import { describe, expect, it } from 'vitest';
import { PLANET_PULL_RANGE_PX, PlanetView, pullFalloff } from '../planet';

describe('pullFalloff', () => {
  it('is 6 avatar heights of range, strongest at the surface and gone beyond the range', () => {
    expect(PLANET_PULL_RANGE_PX).toBe(6 * 64);
    expect(pullFalloff(150, 150)).toBe(1);
    expect(pullFalloff(100, 150)).toBe(1);
    expect(pullFalloff(150 + PLANET_PULL_RANGE_PX, 150)).toBe(0);
    expect(pullFalloff(150 + PLANET_PULL_RANGE_PX / 2, 150)).toBeCloseTo(0.25);
  });
});

describe('PlanetView', () => {
  const state = { id: 1, x: 10, y: 20, vx: 40, vy: -20, radius: 150, seed: 3 };

  it('extrapolates along its velocity and snaps to a server update', () => {
    const planet = new PlanetView(state);

    planet.advance(500);
    expect(planet.x).toBeCloseTo(30);
    expect(planet.y).toBeCloseTo(10);

    planet.sync({ ...state, x: 100, y: 200 });
    expect(planet.x).toBe(100);
    expect(planet.y).toBe(200);
  });
});
