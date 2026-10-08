import { describe, expect, it } from 'vitest';
import { OUTER_WALL_SIZE } from '../cell/cell';
import { MainRoom } from '../cell/mainRoom';
import { SimpleSmallCell } from '../cell/simpleSmallCell';
import { CellData } from '../cellData';
import { Avatar } from '../sprite/avatar';
import type { World } from '../world';

const room = new MainRoom({} as World);
const tvs = room.getTvs();
const wallPx = OUTER_WALL_SIZE * CellData.ANIMATION_STEP;
const avatarHeightPx = Avatar.HEIGHT * CellData.ANIMATION_STEP;

describe('MainRoom background TVs', () => {
  it('has two TVs on floor 1 and two on floor 3 (none on floors 2 and 4), none by the spawn portal', () => {
    expect(tvs).toHaveLength(4);
    const floors = new Map<number, number>();
    for (const tv of tvs) floors.set(tv.y, (floors.get(tv.y) ?? 0) + 1);
    // Each floor's two TVs share a row.
    expect([...floors.values()]).toEqual([2, 2]);

    const centerX = room.getMinCellWidth() / 2;
    expect(tvs.every((tv) => Math.abs(tv.x + tv.width / 2 - centerX) >= 1000)).toBe(true);
  });

  it('keeps floor 3 TVs to the outer edges, away from the middle', () => {
    const upper = tvs.filter((tv) => tv.y < 1000);
    expect(upper).toHaveLength(2);
    for (const tv of upper) expect(Math.abs(tv.x + tv.width / 2 - room.getMinCellWidth() / 2)).toBeGreaterThan(1200);
  });

  it('lowers the floor 1 TVs one avatar height below the middle of their band', () => {
    const lower = tvs.filter((tv) => tv.y > 1000);
    const bandTop = 160 * CellData.ANIMATION_STEP + 2 * CellData.ANIMATION_STEP;
    const bandBottom = room.getMinCellHeight() - wallPx - 2 * CellData.ANIMATION_STEP;
    expect(lower).toHaveLength(2);
    for (const tv of lower) expect(tv.y).toBe(Math.round((bandTop + bandBottom - tv.height) / 2 + avatarHeightPx));
  });

  it('keeps every TV inside the room, clear of the outer walls', () => {
    for (const tv of tvs) {
      expect(tv.x).toBeGreaterThanOrEqual(wallPx);
      expect(tv.x + tv.width).toBeLessThanOrEqual(room.getMinCellWidth() - wallPx);
      expect(tv.y).toBeGreaterThanOrEqual(wallPx);
      expect(tv.y + tv.height).toBeLessThanOrEqual(room.getMinCellHeight() - wallPx);
    }
  });

  it('never overlaps two TVs', () => {
    for (const [i, a] of tvs.entries()) {
      for (const b of tvs.slice(i + 1)) {
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('hangs every TV from chains that end on the platform row right above it, not over the center hole', () => {
    for (const tv of tvs) {
      expect(tv.chainTopY).toBeGreaterThan(wallPx);
      expect(tv.chainTopY).toBeLessThan(tv.y);
      expect(tv.x + tv.width < 1520 || tv.x > 2480).toBe(true);
    }
  });

  it('is MainRoom-only: other rooms have no TVs', () => {
    expect(new SimpleSmallCell({} as World).getTvs()).toEqual([]);
  });
});
