import { describe, expect, it } from 'vitest';
import { DiamondFlight } from '../diamondFlight';

describe('DiamondFlight', () => {
  it('flies a spawned diamond to the target and reports it arriving exactly once', () => {
    const flight = new DiamondFlight();
    const target = { x: 900, y: 40 };
    flight.spawn(100, 500);

    let arrived = 0;
    for (let i = 0; i < 300 && flight.flying.length > 0; i++) arrived += flight.update(16, target);

    expect(arrived).toBe(1);
    expect(flight.flying).toHaveLength(0);
  });

  it('keeps every diamond in flight until it reaches the target, however many there are', () => {
    const flight = new DiamondFlight();
    for (let i = 0; i < 5; i++) flight.spawn(100, 500);

    expect(flight.update(16, { x: 900, y: 40 })).toBe(0);
    expect(flight.flying).toHaveLength(5);
  });

  it('still counts a diamond as arrived if it never reaches the target, so the HUD cannot fall short', () => {
    const flight = new DiamondFlight();
    flight.spawn(100, 500);

    let arrived = 0;
    for (let i = 0; i < 400; i++) arrived += flight.update(16, undefined);

    expect(arrived).toBe(1);
  });
});
