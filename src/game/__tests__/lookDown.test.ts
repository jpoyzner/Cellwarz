import { describe, expect, it } from 'vitest';
import { LOOK_DOWN_DELAY_MS, LookDown } from '../lookDown';

const MAX = 300;

describe('LookDown', () => {
  it('waits a moment after Down is pressed, then scrolls down but never past the maximum', () => {
    const look = new LookDown();
    look.setHeld(true);
    expect(look.update(LOOK_DOWN_DELAY_MS - 50, MAX)).toBe(0);

    expect(look.update(100, MAX)).toBeGreaterThan(0);
    const partway = look.offset;
    expect(look.update(100, MAX)).toBeGreaterThan(partway);

    expect(look.update(10_000, MAX)).toBe(MAX);
  });

  it('glides back to normal once Down is released, and a tap does not move the camera', () => {
    const look = new LookDown();
    look.setHeld(true);
    look.update(LOOK_DOWN_DELAY_MS, MAX);
    look.update(10_000, MAX);

    look.setHeld(false);
    const released = look.update(50, MAX);
    expect(released).toBeLessThan(MAX);
    expect(released).toBeGreaterThan(0);
    expect(look.update(10_000, MAX)).toBe(0);

    look.setHeld(true);
    look.update(100, MAX);
    look.setHeld(false);
    expect(look.update(1000, MAX)).toBe(0);
  });

  it('shrinks to fit when the window gets smaller and resets', () => {
    const look = new LookDown();
    look.setHeld(true);
    look.update(LOOK_DOWN_DELAY_MS, MAX);
    look.update(10_000, MAX);
    expect(look.update(16, 100)).toBe(100);

    look.reset();
    expect(look.offset).toBe(0);
  });
});
