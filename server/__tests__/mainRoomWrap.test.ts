import { describe, expect, it } from 'vitest';
import { MainRoom, WRAP_OPENING_PIXELS } from '../cell/mainRoom';
import { CellData } from '../cellData';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { FULL_JUMP_ACTION_LENGTH, Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import type { World } from '../world';

const STEP = CellData.ANIMATION_STEP;

function buildRoom() {
  const physics = new Physics();
  const world = { getPhysics: () => physics, getZion: () => ({ getHardlines: () => new Map() }) } as unknown as World;
  const room = new MainRoom(world);
  new Engine(room);
  room.init();
  return { room, physics, data: room.getCellData() };
}

function hasWallAt(room: MainRoom, x: number, y: number): boolean {
  const sprites = room.getCellData().getMapPosition(x, y);
  return !!sprites && [...sprites].some((sprite) => sprite instanceof CellBlock);
}

describe('MainRoom wrap openings', () => {
  it('cuts 4-block-wide floor and ceiling openings 30 blocks in from each end wall', () => {
    const { room } = buildRoom();
    const left = WRAP_OPENING_PIXELS.verticalLeftX / STEP;
    const right = WRAP_OPENING_PIXELS.verticalRightX / STEP;
    const width = WRAP_OPENING_PIXELS.verticalWidth / STEP;
    const floorY = 240;

    expect(width).toBe(CellBlock.SIZE * 4);
    expect(left).toBe(8 + CellBlock.SIZE * 30);
    expect(right).toBe(room.getWidth() - 8 - CellBlock.SIZE * 30 - width);

    for (const start of [left, right]) {
      for (let x = start; x < start + width; x++) {
        for (const y of [0, 7, floorY, floorY + 1, 249]) {
          expect(hasWallAt(room, x, y)).toBe(false);
        }
      }
      expect(hasWallAt(room, start - 1, floorY)).toBe(true);
      expect(hasWallAt(room, start + width, floorY)).toBe(true);
      expect(hasWallAt(room, start - 1, 0)).toBe(true);
    }
  });

  it('puts side openings above the second and third platform rows, each reachable with a jump', () => {
    const { room, physics } = buildRoom();
    const openings = WRAP_OPENING_PIXELS.sideOpenings.map(({ top, bottom }) => ({ top: top / STEP, bottom: bottom / STEP }));
    expect(openings).toHaveLength(2);

    const walkwayYs = [100, 160];
    openings.forEach(({ top, bottom }, i) => {
      const sill = walkwayYs[i] - bottom;
      expect(sill).toBeGreaterThan(0);
      expect(sill).toBeLessThan(FULL_JUMP_ACTION_LENGTH);

      for (const x of [0, room.getWidth() - 1]) {
        expect(hasWallAt(room, x, top - 1)).toBe(true);
        expect(hasWallAt(room, x, top)).toBe(false);
        expect(hasWallAt(room, x, bottom - 1)).toBe(false);
        expect(hasWallAt(room, x, bottom)).toBe(true);
      }

      // Standing on the walkway against the left wall: jump up onto the sill, then walk in and out the far side.
      const avatar = new Avatar('jumper', 8, walkwayYs[i] - Avatar.HEIGHT, false, room);
      expect(physics.move(avatar, Physics.NONE, Physics.UP, sill)).toBe(true);
      expect(physics.move(avatar, Physics.LEFT, Physics.NONE, 8)).toBe(true);
      expect(avatar.getX()).toBe(0);
      expect(physics.move(avatar, Physics.LEFT, Physics.NONE, 1)).toBe(true);
      expect(avatar.getX()).toBe(room.getWidth() - Avatar.WIDTH);
      expect(avatar.getY()).toBe(bottom - Avatar.HEIGHT);
      avatar.removePermanently();
    });
  });
});
