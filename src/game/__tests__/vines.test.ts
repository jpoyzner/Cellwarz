import { describe, expect, it } from 'vitest';
import { VineField } from '../vines';
import type { VinesConfig } from '../vines';

const config: VinesConfig = {
  rootX: 2080,
  topY: 0,
  faceY: 96,
  minX: 1520,
  maxX: 2480,
  gaps: [{ start: 1700, end: 1796 }],
  noHanging: [
    { start: 2048, end: 2144 },
    { start: 1968, end: 2032 },
  ],
};

const inside = (x: number, spans: readonly { start: number; end: number }[]): boolean => spans.some((span) => x > span.start && x < span.end);

describe('VineField', () => {
  const field = new VineField(config);

  it('grows the same vines from the same config every time', () => {
    const again = new VineField(config);
    expect(again.tinted).toEqual(field.tinted);
    expect(again.hanging).toEqual(field.hanging);
  });

  it('tints the whole stretch of ceiling wall given, except the openings with no wall', () => {
    expect(field.tinted).toEqual([
      { start: config.minX, end: 1700 },
      { start: 1796, end: config.maxX },
    ]);
    expect(new VineField({ ...config, gaps: [] }).tinted).toEqual([{ start: config.minX, end: config.maxX }]);
  });

  it('draws no roots over the wall blocks', () => {
    expect(Object.keys(field)).not.toContain('roots');
  });

  it('hangs plenty of vines along the whole stretch, but not through openings or in front of the flower and lamps', () => {
    expect(field.hanging.length).toBeGreaterThan(10);
    expect(Math.min(...field.hanging.map((vine) => vine.x))).toBeLessThan(config.minX + 100);
    expect(Math.max(...field.hanging.map((vine) => vine.x))).toBeGreaterThan(config.maxX - 100);
    for (const vine of field.hanging) {
      expect(inside(vine.x, config.gaps)).toBe(false);
      expect(inside(vine.x, config.noHanging)).toBe(false);
    }
  });

  it('gives vines varied lengths that stay clear of the platforms below', () => {
    const lengths = field.hanging.map((vine) => vine.length);
    expect(new Set(lengths.map(Math.round)).size).toBeGreaterThan(10);
    expect(Math.max(...lengths) + config.faceY).toBeLessThan(220);
  });

  it('is only on screen while the ceiling band is in view', () => {
    expect(field.isVisible(1500, 0, 1200, 800)).toBe(true);
    expect(field.isVisible(1500, 600, 1200, 800)).toBe(false);
    expect(field.isVisible(5000, 0, 1200, 800)).toBe(false);
  });

  it('only draws what is in view', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? (...args: unknown[]) => {
            calls.push(`${name}${args.length}`);
            return { addColorStop: () => undefined };
          } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D;

    field.draw(ctx, 1500, 800, 1200, 800, 0);
    expect(calls).toEqual([]);

    field.draw(ctx, 1500, 0, 1200, 800, 0);
    expect(calls.filter((call) => call.startsWith('stroke')).length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.startsWith('fillRect')).length).toBe(field.tinted.length);
  });
});
