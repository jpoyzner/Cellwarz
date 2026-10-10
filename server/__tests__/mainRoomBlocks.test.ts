import { afterEach, describe, expect, it } from 'vitest';
import { OUTER_WALL_SIZE } from '../cell/cell';
import { MainRoom, TEST_FIXTURE_PIXELS } from '../cell/mainRoom';
import { CellData } from '../cellData';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { GravityBlock } from '../sprite/gravityBlock';
import { Ice } from '../sprite/ice';
import { Launcher } from '../sprite/launcher';
import { RainbowBlock } from '../sprite/rainbowBlock';
import { Robot } from '../sprite/robot';
import { Shield } from '../sprite/shield';
import { StickyBlock } from '../sprite/stickyBlock';
import { Thruster } from '../sprite/thruster';
import type { World } from '../world';

function createRoom(): MainRoom {
  const physics = new Physics();
  const world = {
    getPhysics: () => physics,
    getZion: () => ({ getHardlines: () => new Map(), getRandomEngine: () => ({ getCell: () => room }) }),
  } as unknown as World;
  const room = new MainRoom(world);
  new Engine(room);
  room.init();
  return room;
}

const countOf = (room: MainRoom, type: abstract new (...args: never[]) => unknown): number =>
  room
    .getCellData()
    .getSprites()
    .filter((sprite) => sprite instanceof type).length;

describe('MainRoom blocks', () => {
  afterEach(() => {
    delete process.env.CELLWARZ_RANDOM_BLOCKS;
    delete process.env.CELLWARZ_ROBOTS;
  });

  it('scatters every kind of block, plus the robots', () => {
    const room = createRoom();

    for (const type of [Thruster, Launcher, Ice, Shield, StickyBlock, RainbowBlock, Robot]) {
      expect(countOf(room, type)).toBeGreaterThan(0);
    }
  });

  it('leaves out the purple blocks for now', () => {
    expect(countOf(createRoom(), GravityBlock)).toBe(0);
  });

  it('puts a fixed yellow, green and red block on the floor', () => {
    const room = createRoom();
    const sprites = room.getCellData().getSprites();

    for (const [pixelsX, type] of [
      [TEST_FIXTURE_PIXELS.thrusterX, Thruster],
      [TEST_FIXTURE_PIXELS.shieldX, Shield],
      [TEST_FIXTURE_PIXELS.launcherX, Launcher],
    ] as const) {
      expect(sprites.find((sprite) => sprite instanceof type && sprite.getXPixels() === pixelsX)).toBeDefined();
    }
  });

  it('leaves the bottom floor free to run along: no wall blocks standing on it or hanging low above it', () => {
    const room = createRoom();
    const floorY = Math.floor(room.getMinCellHeight() / CellData.ANIMATION_STEP) - OUTER_WALL_SIZE - 2;
    const innerLeft = OUTER_WALL_SIZE;
    const innerRight = room.getWidth() - OUTER_WALL_SIZE;

    const obstructions = room
      .getCellData()
      .getSprites()
      .filter(
        (sprite) =>
          sprite instanceof CellBlock &&
          sprite.getX() >= innerLeft &&
          sprite.getX() < innerRight &&
          sprite.getY() < floorY &&
          sprite.getY() + CellBlock.SIZE > floorY - Avatar.HEIGHT,
      );

    expect(obstructions).toEqual([]);
  });

  it('can leave out the random blocks (keeping the fixtures) and the robots, for deterministic e2e runs', () => {
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
    process.env.CELLWARZ_ROBOTS = 'off';
    const room = createRoom();

    expect(countOf(room, Robot)).toBe(0);
    expect(countOf(room, Thruster)).toBe(1);
    expect(countOf(room, Shield)).toBe(1);
    expect(countOf(room, Launcher)).toBe(1);
    for (const type of [Ice, GravityBlock, StickyBlock, RainbowBlock]) expect(countOf(room, type)).toBe(0);
  });
});
