import { describe, expect, it, vi } from 'vitest';
import { BUBBLE_TOTAL_HEIGHT_PX, drawEmojiBubble } from '../emojiBubble';

function fakeContext() {
  const fillText = vi.fn();
  const ctx = new Proxy(
    { fillText },
    { get: (target, prop) => (prop in target ? target[prop as 'fillText'] : vi.fn()), set: () => true },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fillText };
}

describe('drawEmojiBubble', () => {
  it('draws the emoji centred over the head and entirely above its top', () => {
    const { ctx, fillText } = fakeContext();

    drawEmojiBubble(ctx, '🔥', 200, 300);

    expect(fillText).toHaveBeenCalledTimes(1);
    const [emoji, x, y] = fillText.mock.calls[0];
    expect(emoji).toBe('🔥');
    expect(x).toBe(200);
    expect(y).toBeLessThan(300);
    expect(y).toBeGreaterThan(300 - BUBBLE_TOTAL_HEIGHT_PX);
  });
});
