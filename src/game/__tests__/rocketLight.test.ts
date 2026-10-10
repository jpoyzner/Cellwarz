import { describe, expect, it } from 'vitest';
import { isRocketPath, rocketFacesLeft } from '../rocketLight';

describe('rocketLight', () => {
  it('recognizes rocket art and its flight direction from the image path', () => {
    expect(isRocketPath('/images/projectiles/missile.png')).toBe(true);
    expect(isRocketPath('/images/projectiles/missileL.png')).toBe(true);
    expect(isRocketPath('/images/projectiles/bullet1.png')).toBe(false);
    expect(rocketFacesLeft('/images/projectiles/missile.png')).toBe(false);
    expect(rocketFacesLeft('/images/projectiles/missileL.png')).toBe(true);
  });
});
