import { describe, expect, it } from 'vitest';
import { DEMO_LOOP_MS, demoFrame } from '../controlsDemo';

describe('demoFrame (the login screen grab-and-throw clip)', () => {
  it('starts with the block resting beside the avatar, and lifts it overhead when SPACE is pressed', () => {
    const resting = demoFrame(400);
    const carried = demoFrame(1500);
    expect(resting.spaceLit).toBe(false);
    expect(carried.block.y).toBeLessThan(resting.block.y);
    expect(carried.block.x).toBeLessThan(resting.block.x);
  });

  it('flashes SPACE once for the grab and once for the throw', () => {
    const lit: number[] = [];
    for (let t = 0; t < DEMO_LOOP_MS; t += 50) if (demoFrame(t).spaceLit) lit.push(t);
    expect(lit.length).toBeGreaterThan(0);
    expect(Math.min(...lit)).toBeLessThan(1200);
    expect(Math.max(...lit)).toBeGreaterThan(2000);
    expect(lit.some((t) => t > 1300 && t < 2000)).toBe(false);
  });

  it('throws the block forward in an arc and leaves it on the floor, ahead of where it was carried', () => {
    const carried = demoFrame(2000).block;
    const midFlight = demoFrame(2500).block;
    const landed = demoFrame(3200).block;
    expect(midFlight.x).toBeGreaterThan(carried.x);
    expect(midFlight.y).toBeLessThan(landed.y); // still airborne
    expect(landed.x).toBeGreaterThan(midFlight.x);
    expect(demoFrame(3500).block).toEqual(landed);
  });

  it('fades the block in and out at the loop seam and repeats', () => {
    expect(demoFrame(0).blockAlpha).toBe(0);
    expect(demoFrame(DEMO_LOOP_MS - 10).blockAlpha).toBeLessThan(0.1);
    expect(demoFrame(1500).blockAlpha).toBe(1);
    expect(demoFrame(1500 + DEMO_LOOP_MS)).toEqual(demoFrame(1500));
  });

  it('keeps the stand animation within its six frames', () => {
    for (let t = 0; t < DEMO_LOOP_MS; t += 37) {
      const { standFrame } = demoFrame(t);
      expect(standFrame).toBeGreaterThanOrEqual(0);
      expect(standFrame).toBeLessThan(6);
    }
  });
});
