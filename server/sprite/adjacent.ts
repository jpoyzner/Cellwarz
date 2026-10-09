import { EdgeOfCellDataException } from '../errors';
import type { Sprite } from './sprite';

/** Every other sprite occupying the one-cell ring around `sprite` (sharing a side with it, not just a corner). */
export function getAdjacentSprites(sprite: Sprite): Set<Sprite> {
  const adjacent = new Set<Sprite>();
  const left = sprite.getClippedX() - 1;
  const right = sprite.getClippedX() + sprite.getClippedWidth();
  const top = sprite.getClippedY() - 1;
  const bottom = sprite.getClippedY() + sprite.getClippedHeight();

  for (let column = left; column <= right; column++) {
    for (let row = top; row <= bottom; row++) {
      const isCorner = (column === left || column === right) && (row === top || row === bottom);
      if (isCorner) continue;

      try {
        for (const other of sprite.getCellData().getMapPosition(column, row) ?? []) {
          if (other !== sprite) adjacent.add(other);
        }
      } catch (e) {
        if (!(e instanceof EdgeOfCellDataException)) throw e;
      }
    }
  }

  return adjacent;
}
