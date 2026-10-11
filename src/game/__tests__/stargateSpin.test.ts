import { describe, expect, it } from 'vitest';
import { isStargatePath, stargateAngle, STARGATE_SPIN_PERIOD_MS } from '../stargateSpin';

describe('stargateSpin', () => {
  it('recognizes only stargate art', () => {
    expect(isStargatePath('/images/doors/stargate/idle3.png')).toBe(true);
    expect(isStargatePath('/images/doors/entrance/idle1.png')).toBe(false);
  });

  it('turns once per period and keeps advancing', () => {
    expect(stargateAngle(0)).toBe(0);
    expect(stargateAngle(STARGATE_SPIN_PERIOD_MS / 2)).toBeCloseTo(Math.PI);
    expect(stargateAngle(STARGATE_SPIN_PERIOD_MS)).toBeCloseTo(0);
    expect(stargateAngle(1000)).toBeLessThan(stargateAngle(2000));
  });
});
