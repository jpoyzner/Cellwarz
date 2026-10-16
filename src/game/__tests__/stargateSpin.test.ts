import { describe, expect, it } from 'vitest';
import { isStargatePath } from '../stargateSpin';

describe('stargateSpin', () => {
  it('recognizes only stargate art', () => {
    expect(isStargatePath('/images/doors/stargate/idle3.png')).toBe(true);
    expect(isStargatePath('/images/doors/entrance/idle1.png')).toBe(false);
  });
});
