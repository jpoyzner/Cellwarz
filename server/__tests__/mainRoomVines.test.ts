import { describe, expect, it } from 'vitest';
import { OUTER_WALL_SIZE } from '../cell/cell';
import { CENTER_OPENING_PIXELS, FLOWER_PIXELS, MainRoom, WRAP_OPENING_PIXELS } from '../cell/mainRoom';
import { SimpleSmallCell } from '../cell/simpleSmallCell';
import { CellData } from '../cellData';
import type { World } from '../world';

const room = new MainRoom({} as World);
const vines = room.getVines()!;
const wallPx = OUTER_WALL_SIZE * CellData.ANIMATION_STEP;

describe('MainRoom ceiling vines', () => {
  it('grow from the flower stem on the ceiling wall, between its top edge and its lower face', () => {
    expect(vines.rootX).toBe(FLOWER_PIXELS.x + FLOWER_PIXELS.width / 2);
    expect(vines.topY).toBe(0);
    expect(vines.faceY).toBe(wallPx);
    expect(vines.faceY).toBe(FLOWER_PIXELS.y);
  });

  it('are confined to the ceiling over the central opening, about one screen wide, flower included', () => {
    expect(vines.minX).toBe(CENTER_OPENING_PIXELS.left);
    expect(vines.maxX).toBe(CENTER_OPENING_PIXELS.right);
    expect(vines.maxX - vines.minX).toBeLessThanOrEqual(1100);
    expect(FLOWER_PIXELS.x).toBeGreaterThanOrEqual(vines.minX);
    expect(FLOWER_PIXELS.x + FLOWER_PIXELS.width).toBeLessThanOrEqual(vines.maxX);
  });

  it('leave the rest of the ceiling bare, including both ceiling wrap openings (which have no wall anyway)', () => {
    expect(vines.minX).toBeGreaterThan(wallPx);
    expect(vines.maxX).toBeLessThan(room.getMinCellWidth() - wallPx);
    for (const x of [WRAP_OPENING_PIXELS.verticalLeftX, WRAP_OPENING_PIXELS.verticalRightX]) {
      expect(x + WRAP_OPENING_PIXELS.verticalWidth <= vines.minX || x >= vines.maxX).toBe(true);
    }
    expect(vines.gaps).toEqual([]);
  });

  it('keep nothing hanging in front of the flower or any lamp fixture', () => {
    expect(vines.noHanging).toContainEqual({ start: FLOWER_PIXELS.x, end: FLOWER_PIXELS.x + FLOWER_PIXELS.width });
    for (const lamp of room.getLamps().filter((l) => l.x > vines.minX && l.x < vines.maxX)) {
      expect(vines.noHanging.some((span) => span.start <= lamp.x - 18 && span.end >= lamp.x + 18)).toBe(true);
    }
  });

  it('are MainRoom-only', () => {
    expect(new SimpleSmallCell({} as World).getVines()).toBeUndefined();
  });
});
