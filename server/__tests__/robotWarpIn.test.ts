import { afterEach, describe, expect, it } from 'vitest';
import { MainRoom } from '../cell/mainRoom';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Avatar } from '../sprite/avatar';
import { Robot } from '../sprite/robot';
import type { World } from '../world';

const CHECK_FRAMES = 48;

function createRoom(): MainRoom {
  const physics = new Physics();
  const world = { getPhysics: () => physics, getZion: () => ({ getHardlines: () => new Map() }) } as unknown as World;
  const room = new MainRoom(world);
  new Engine(room);
  room.init();
  return room;
}

const liveRobots = (room: MainRoom) => room.getCellData().getSprites().filter((sprite) => sprite instanceof Robot && !sprite.removed());

function step(room: MainRoom, frames: number): void {
  for (let i = 0; i < frames; i++) room.process();
}

describe('robots warping into a room that has none left', () => {
  afterEach(() => {
    delete process.env.CELLWARZ_RANDOM_BLOCKS;
    delete process.env.CELLWARZ_ROBOTS;
    delete process.env.CELLWARZ_PLANET_PULL;
  });

  it('brings in exactly one new robot, on bare floor, once the last one is gone', () => {
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
    const room = createRoom();
    expect(liveRobots(room).length).toBe(room.getNumRobots());

    const [spared, ...others] = liveRobots(room);
    others.forEach((robot) => robot.removePermanently());
    step(room, CHECK_FRAMES * 2);
    expect(liveRobots(room)).toEqual([spared]); // one robot is left, so nothing warps in.

    spared.removePermanently();
    step(room, CHECK_FRAMES);
    const warped = liveRobots(room);
    expect(warped.length).toBe(1);
    expect(warped[0]).not.toBe(spared);

    step(room, CHECK_FRAMES * 3);
    expect(liveRobots(room).length).toBe(1);
  });

  it('never lands next to a real player', () => {
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
    const room = createRoom();
    liveRobots(room).forEach((robot) => robot.removePermanently());
    const player = new Avatar('target', room.getCellData().getWidth() / 2, 60, true, room);

    for (let round = 0; round < 5; round++) {
      step(room, CHECK_FRAMES);
      const [robot] = liveRobots(room);
      expect(Math.hypot(robot.getX() - player.getX(), robot.getY() - player.getY())).toBeGreaterThanOrEqual(60);
      robot.removePermanently();
    }
  });

  it('does nothing in a room configured without robots', () => {
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
    process.env.CELLWARZ_ROBOTS = 'off';
    const room = createRoom();
    step(room, CHECK_FRAMES * 3);
    expect(liveRobots(room)).toEqual([]);
  });
});
