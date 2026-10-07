import { describe, expect, it } from 'vitest';
import { SpaceBackground } from '../spaceBackground';

function makeSeeded(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function makeSpace(): SpaceBackground {
  return new SpaceBackground(4000, 2000, 800, 600, makeSeeded());
}

describe('SpaceBackground', () => {
  it('scatters pieces across the whole world, not just the visible screen', () => {
    const space = makeSpace();

    expect(space.pieces.length).toBeGreaterThan(24);
    expect(Math.max(...space.pieces.map((p) => p.x))).toBeGreaterThan(800);
    expect(Math.max(...space.pieces.map((p) => p.y))).toBeGreaterThan(600);
  });

  it('shatters a piece into one shard per cell and replaces it when an avatar rect touches it', () => {
    const space = makeSpace();
    const pieceCountBefore = space.pieces.length;
    const target = space.pieces[0];

    space.update(0, [{ x: target.x - 24, y: target.y - 32, width: 48, height: 64 }]);

    expect(space.pieces).toHaveLength(pieceCountBefore);
    expect(space.pieces).not.toContain(target);
    expect(space.shards).toHaveLength(4);
  });

  it('leaves pieces alone (and fixed in the world) when no avatar is near them', () => {
    const space = makeSpace();
    const target = space.pieces[0];
    target.dx = 0;
    target.dy = 0;
    const { x, y } = target;

    space.update(16, [{ x: x + 2000, y: y + 2000, width: 48, height: 64 }]);

    expect(space.pieces).toContain(target);
    expect(space.shards).toHaveLength(0);
    expect(target.x).toBe(x);
    expect(target.y).toBe(y);
  });

  it('respawns a shattered piece away from the avatar that broke it', () => {
    const space = makeSpace();
    const target = space.pieces[0];
    const avatar = { x: target.x - 24, y: target.y - 32, width: 48, height: 64 };

    space.update(0, [avatar]);

    const replacement = space.pieces[space.pieces.length - 1];
    expect(Math.hypot(replacement.x - avatar.x, replacement.y - avatar.y)).toBeGreaterThan(100);
  });

  it('flings shards away and discards them after their lifetime', () => {
    const space = makeSpace();
    const target = space.pieces[0];
    space.update(0, [{ x: target.x - 24, y: target.y - 32, width: 48, height: 64 }]);
    const shard = space.shards[0];
    const startX = shard.x;
    const startY = shard.y;

    space.update(16, []);

    expect(Math.hypot(shard.x - startX, shard.y - startY)).toBeGreaterThan(1);

    for (let i = 0; i < 120; i++) space.update(16, []);
    expect(space.shards).toHaveLength(0);
  });

  it('drifts every star the same slow way, wrapping on screen', () => {
    const space = makeSpace();
    const stars = (space as unknown as { stars: Array<{ x: number; y: number }> }).stars;
    const before = stars.map((s) => ({ x: s.x, y: s.y }));

    space.update(16, []);

    const moves = stars.map((s, i) => ({ dx: s.x - before[i].x, dy: s.y - before[i].y }));
    const unwrapped = moves.filter((m) => Math.abs(m.dx) < 5 && Math.abs(m.dy) < 5);
    expect(unwrapped.length).toBeGreaterThan(stars.length / 2);
    for (const m of unwrapped) {
      expect(m.dx).toBeCloseTo(unwrapped[0].dx, 6);
      expect(m.dy).toBeCloseTo(unwrapped[0].dy, 6);
    }
    expect(Math.hypot(unwrapped[0].dx, unwrapped[0].dy)).toBeGreaterThan(0);
    expect(Math.hypot(unwrapped[0].dx, unwrapped[0].dy)).toBeLessThan(0.5);

    for (let i = 0; i < 2000; i++) space.update(16, []);
    expect(stars.every((s) => s.x >= 0 && s.x <= 800 && s.y >= 0 && s.y <= 600)).toBe(true);
  });

  it('flies blocks broken by a collecting avatar to the score target and reports each one', () => {
    const space = makeSpace();
    const target = space.pieces[0];
    const scoreTarget = { x: target.x + 600, y: target.y - 300 };
    const avatar = { x: target.x - 24, y: target.y - 32, width: 48, height: 64, collects: true };

    let collected = space.update(0, [avatar], scoreTarget);
    expect(space.shards).toHaveLength(4);

    for (let i = 0; i < 300; i++) collected += space.update(16, [], scoreTarget);

    expect(collected).toBe(4);
    expect(space.shards).toHaveLength(0);
  });

  it('does not collect blocks broken by other avatars', () => {
    const space = makeSpace();
    const target = space.pieces[0];
    const scoreTarget = { x: target.x + 600, y: target.y - 300 };

    space.update(0, [{ x: target.x - 24, y: target.y - 32, width: 48, height: 64 }], scoreTarget);
    let collected = 0;
    for (let i = 0; i < 300; i++) collected += space.update(16, [], scoreTarget);

    expect(collected).toBe(0);
  });
});
