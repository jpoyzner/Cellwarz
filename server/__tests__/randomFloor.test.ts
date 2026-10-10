import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MainRoom } from '../cell/mainRoom';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import type { Entrance } from '../sprite/entrance';
import type { World } from '../world';

describe('Cell.addAvatarAtRandomFloor', () => {
  let room: MainRoom;
  let physics: Physics;

  beforeAll(() => {
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
    process.env.CELLWARZ_ROBOTS = 'off';
    physics = new Physics();
    const world = { getPhysics: () => physics, getZion: () => ({ getHardlines: () => new Map() }) } as unknown as World;
    room = new MainRoom(world);
    new Engine(room);
    room.init();
  });

  afterAll(() => {
    delete process.env.CELLWARZ_RANDOM_BLOCKS;
    delete process.env.CELLWARZ_ROBOTS;
    delete process.env.CELLWARZ_RANDOM_TELEPORT;
  });

  function spritesAround(avatar: Avatar) {
    const found = new Set<unknown>();
    for (let x = avatar.getX() - 1; x <= avatar.getX() + Avatar.WIDTH; x++) {
      for (let y = avatar.getY() - 1; y <= avatar.getY() + Avatar.HEIGHT; y++) {
        for (const sprite of room.getCellData().getMapPosition(x, y) ?? []) if (sprite !== avatar) found.add(sprite);
      }
    }
    return found;
  }

  it('lands every avatar standing on wall blocks, with nothing but wall blocks beside, above or below it', () => {
    const spots = new Set<string>();

    for (let i = 0; i < 40; i++) {
      const avatar = room.addAvatarAtRandomFloor(`floor-${i}`)!;
      expect(avatar).toBeDefined();
      expect(physics.touchSprite(avatar, Physics.NONE, Physics.DOWN, false)).toBe(true); // already resting on the floor
      for (const neighbour of spritesAround(avatar)) expect(neighbour).toBeInstanceOf(CellBlock);
      spots.add(`${avatar.getX()},${avatar.getY()}`);
    }

    // Random, not a fixed spot (the odds of 40 identical random picks are nil).
    expect(spots.size).toBeGreaterThan(5);
  });

  it('puts avatars on more than one floor of the room', () => {
    const floors = new Set<number>();
    for (let i = 0; i < 60; i++) floors.add(room.addAvatarAtRandomFloor(`levels-${i}`)!.getY());
    expect(floors.size).toBeGreaterThan(1);
  });

  it('stays clear of robots', () => {
    const robotSpot = room.addAvatarAtRandomFloor('robot-stand-in')!;
    robotSpot.isRobot = () => true;

    for (let i = 0; i < 80; i++) {
      const avatar = room.addAvatarAtRandomFloor(`avoider-${i}`)!;
      const near = Math.abs(avatar.getX() - robotSpot.getX()) < 24 && Math.abs(avatar.getY() - robotSpot.getY()) < 24;
      expect(near).toBe(false);
    }
  });

  it('uses the spawn portals instead when CELLWARZ_RANDOM_TELEPORT is off', () => {
    process.env.CELLWARZ_RANDOM_TELEPORT = 'off';
    try {
      const entranceXs = (room as unknown as { entrances: Entrance[] }).entrances.map((entrance) => entrance.getEntranceX());
      for (let i = 0; i < 5; i++) expect(entranceXs).toContain(room.addAvatarAtRandomFloor(`portal-${i}`)!.getX());
    } finally {
      delete process.env.CELLWARZ_RANDOM_TELEPORT;
    }
  });
});
