import { describe, expect, it } from 'vitest';
import { ParticleSystem } from '../particles';
import { isStarPath } from '../starFire';

describe('starFire', () => {
  it('recognizes ninja star art by its image path', () => {
    expect(isStarPath('/images/projectiles/star1.png')).toBe(true);
    expect(isStarPath('/images/projectiles/missile.png')).toBe(false);
  });

  it('leaves sparks behind that fade away', () => {
    const particles = new ParticleSystem();
    let drawn = 0;
    const ctx = { fillRect: () => drawn++, set fillStyle(_value: string) {} } as unknown as CanvasRenderingContext2D;

    particles.spawnSparks(100, 100, 3);
    particles.draw(ctx, 0, 0);
    expect(drawn).toBe(3);

    particles.update(2000);
    drawn = 0;
    particles.draw(ctx, 0, 0);
    expect(drawn).toBe(0);
  });
});
