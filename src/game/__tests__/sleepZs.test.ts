import { describe, expect, it } from 'vitest';
import { SleepZs, sleepLean } from '../sleepZs';

describe('SleepZs', () => {
  const sleepers = new Map([['7', { x: 100, y: 50 }]]);

  it('emits a Z as soon as someone sleeps, keeps emitting, and lets them all fade away after the sleeper wakes', () => {
    const zs = new SleepZs();
    zs.update(16, sleepers);
    expect(zs.count).toBe(1);

    for (let i = 0; i < 100; i++) zs.update(50, sleepers);
    expect(zs.count).toBeGreaterThan(1);
    expect(zs.count).toBeLessThan(10); // old Zs disappear instead of piling up

    for (let i = 0; i < 100; i++) zs.update(50, new Map());
    expect(zs.count).toBe(0);
  });

  it('draws nothing when no Z is floating', () => {
    let calls = 0;
    const ctx = new Proxy({}, { get: () => () => calls++ }) as unknown as CanvasRenderingContext2D;
    new SleepZs().draw(ctx, 0, 0);
    expect(calls).toBe(0);
  });
});

describe('sleepLean', () => {
  it('slumps towards the facing direction, with only a slow breathing sway on top', () => {
    expect(sleepLean(false, 0)).toBeGreaterThan(0.05);
    expect(sleepLean(true, 0)).toBeLessThan(-0.05);
    expect(Math.abs(sleepLean(false, 650) - sleepLean(false, 0))).toBeLessThan(0.06);
  });
});
