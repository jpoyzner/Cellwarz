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
    expect(again.roots).toEqual(field.roots);
    expect(again.hanging).toEqual(field.hanging);
  });

  it('starts roots at the foot of the flower stem and spreads them along the whole stretch of ceiling given, both ways', () => {
    const xs = field.roots.flatMap((root) => root.points.map((point) => point[0]));
    expect(field.roots.some((root) => root.points[0][0] === config.rootX && root.points[0][1] === config.faceY)).toBe(true);
    expect(Math.min(...xs)).toBeLessThanOrEqual(config.minX + 30);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(config.maxX - 30);
  });

  it('keeps every root inside the wall: between its top edge and its lower face, and between the end walls', () => {
    for (const root of field.roots) {
      for (const [x, y] of root.points) {
        expect(y).toBeGreaterThanOrEqual(config.topY);
        expect(y).toBeLessThanOrEqual(config.faceY);
        expect(x).toBeGreaterThanOrEqual(config.minX);
        expect(x).toBeLessThanOrEqual(config.maxX);
      }
    }
  });

  it('wraps roots up near the top of the wall as well as along its face', () => {
    const ys = field.roots.flatMap((root) => root.points.map((point) => point[1]));
    expect(Math.min(...ys)).toBeLessThan(config.faceY * 0.3);
    expect(Math.max(...ys)).toBeGreaterThan(config.faceY * 0.7);
  });

  it('wraps a thick knot of roots over the wall right above the flower, from one side of the stem to the other', () => {
    const above = field.roots.filter((root) => root.points.some(([x, y]) => Math.abs(x - config.rootX) < 12 && y < config.faceY * 0.6));
    expect(above.length).toBeGreaterThanOrEqual(5);

    // Arcs leave the lower face on one side of the stem and come back down on the other.
    const arcs = field.roots.filter((root) => {
      const first = root.points[0];
      const last = root.points[root.points.length - 1];
      return first[1] >= config.faceY - 2 && last[1] >= config.faceY - 2 && first[0] < config.rootX - 20 && last[0] > config.rootX + 20;
    });
    expect(arcs.length).toBeGreaterThanOrEqual(4);

    // Within a flower's width either side of the stem the wall is crowded with roots, thicker than the thin strands further out.
    const nearby = field.roots.filter((root) => root.points.some(([x]) => Math.abs(x - config.rootX) < 130)).length;
    const farAway = field.roots.filter((root) => root.points.every(([x]) => Math.abs(x - config.rootX) >= 130 && Math.abs(x - config.rootX) < 260)).length;
    expect(nearby).toBeGreaterThan(farAway);
  });

  it('never runs a root across a stretch with no wall', () => {
    for (const root of field.roots) {
      for (let i = 1; i < root.points.length; i++) {
        const from = Math.min(root.points[i - 1][0], root.points[i][0]);
        const to = Math.max(root.points[i - 1][0], root.points[i][0]);
        expect(config.gaps.some((gap) => from < gap.end && to > gap.start)).toBe(false);
      }
    }
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
    const ctx = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? (...args: unknown[]) => calls.push(`${name}${args.length}`) : undefined), set: () => true }) as unknown as CanvasRenderingContext2D;

    field.draw(ctx, 1500, 800, 1200, 800, 0);
    expect(calls).toEqual([]);

    field.draw(ctx, 1500, 0, 1200, 800, 0);
    expect(calls.filter((call) => call.startsWith('stroke')).length).toBeGreaterThan(0);
  });
});
