import type { Cell } from './cell/cell';

/** One sprite's authoritative server-side state: what the terse wire format hides (class, size, layer, mass, motion). */
export interface DumpedSprite {
  id: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  mass: number;
  removed: boolean;
  state?: Record<string, unknown>;
}

/** Positions are in grid units (8px each), like the server's own physics; `id` is the cell index the client keys sprites by. */
export function dumpSprites(cell: Cell): DumpedSprite[] {
  return cell
    .getCellData()
    .getSprites()
    .map((sprite) => {
      const state = sprite.getDebugState();
      return {
        id: sprite.getCellIndex(),
        type: sprite.constructor.name,
        x: sprite.getX(),
        y: sprite.getY(),
        width: sprite.getWidth(),
        height: sprite.getHeight(),
        layer: sprite.getLayer(),
        mass: sprite.getMass(),
        removed: sprite.removed(),
        ...(state && { state }),
      };
    });
}
