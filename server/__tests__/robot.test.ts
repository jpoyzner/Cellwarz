import { describe, expect, it } from 'vitest';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Robot } from '../sprite/robot';
import { Session } from '../session';
import type { World } from '../world';
import { createTestCell } from './testHelpers';

function createTestScene(width: number, height: number) {
  const { cell, physics } = createTestCell(width, height);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  Avatar.init(cellData);
  return { cell, physics };
}

describe('Robot', () => {
  it('starts running right by default', () => {
    const { cell } = createTestScene(50, 50);
    const robot = new Robot(10, 10, false, cell);

    const xBefore = robot.getX();
    robot['doAction']();

    expect(robot.getX()).toBeGreaterThanOrEqual(xBefore);
  });

  it('turns around and runs the other way after hitting an obstacle', () => {
    const { cell } = createTestScene(50, 50);
    new CellBlock(10, 30, false, cell);
    new CellBlock(12, 30, false, cell);
    new CellBlock(14, 30, false, cell);
    new CellBlock(16, 30, false, cell);
    new CellBlock(20, 20, false, cell); // wall directly to the right of the robot's path.
    new CellBlock(20, 22, false, cell);
    const robot = new Robot(10, 22, false, cell);

    for (let i = 0; i < 120; i++) {
      robot['doAction']();
    }

    expect(robot['facingRight']).toBe(false);
    expect(robot['xPower']).toBeLessThan(0); // running left now.
  });

  it('keeps patrolling back and forth between two walls indefinitely', () => {
    const { cell } = createTestScene(50, 50);
    for (let x = 10; x <= 18; x += 2) {
      new CellBlock(x, 30, false, cell); // floor.
    }
    new CellBlock(6, 20, false, cell); // left wall.
    new CellBlock(6, 22, false, cell);
    new CellBlock(20, 20, false, cell); // right wall.
    new CellBlock(20, 22, false, cell);
    const robot = new Robot(10, 22, false, cell);

    const xs: number[] = [];
    for (let i = 0; i < 1200; i++) {
      robot['doAction']();
      xs.push(robot.getX());
    }

    // Bounded between the two walls (never stuck permanently against either one) and still moving late on.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(18);
    expect(new Set(xs.slice(-150)).size).toBeGreaterThan(1);
  });

  describe('pausing before turning around', () => {
    function createBlockedRobot() {
      const { cell } = createTestScene(50, 50);
      for (let x = 6; x <= 20; x += 2) new CellBlock(x, 30, false, cell); // floor.
      new CellBlock(20, 20, false, cell); // wall just right of the robot's path.
      new CellBlock(20, 22, false, cell);
      const robot = new Robot(10, 22, false, cell);

      let frames = 0;
      while (robot['turnAroundPauseFrames'] === 0 && frames++ < 100) robot['doAction']();
      return robot;
    }

    it('stands still facing the obstacle for one second (48 frames), then turns around', () => {
      const robot = createBlockedRobot();
      const blockedAtX = robot.getX();
      expect(robot['turnAroundPauseFrames']).toBe(Engine.EVERY_SECOND);

      for (let i = 0; i < Engine.EVERY_SECOND - 1; i++) {
        robot['doAction']();
        expect(robot.getX()).toBe(blockedAtX);
        expect(robot['xPower']).toBe(Physics.NONE);
        expect(robot['facingRight']).toBe(true);
      }

      robot['doAction']();
      expect(robot['facingRight']).toBe(false);
      expect(robot['xPower']).toBe(Physics.LEFT);
    });

    it('starts moving the other way only after the pause is over', () => {
      const robot = createBlockedRobot();
      const blockedAtX = robot.getX();

      for (let i = 0; i < Engine.EVERY_SECOND + 5; i++) robot['doAction']();

      expect(robot.getX()).toBeLessThan(blockedAtX);
    });
  });

  describe('touching a player', () => {
    function createArena() {
      const { cell } = createTestScene(60, 50);
      for (let x = 6; x <= 50; x += 2) new CellBlock(x, 30, false, cell); // floor.
      return cell;
    }

    it('kills a player standing right beside it', () => {
      const cell = createArena();
      const robot = new Robot(10, 22, false, cell);
      const victim = new Avatar('victim', 16, 22, false, cell);

      robot['doAction']();

      expect(victim.removed()).toBe(true);
    });

    it('kills a player standing on its head', () => {
      const cell = createArena();
      const robot = new Robot(10, 22, false, cell);
      const victim = new Avatar('rider', 10, 14, false, cell);

      robot['doAction']();

      expect(victim.removed()).toBe(true);
    });

    it('kills a player that walks into it while the robot is paused', () => {
      const cell = createArena();
      const robot = new Robot(10, 22, false, cell);
      robot['pauseBeforeTurning']();
      const victim = new Avatar('walker', 30, 22, false, cell);
      victim.runLeft();

      for (let i = 0; i < 40 && !victim.removed(); i++) {
        victim['doAction']();
        robot['doAction']();
      }

      expect(victim.removed()).toBe(true);
    });

    it('leaves a player alone who is not touching it', () => {
      const cell = createArena();
      const robot = new Robot(10, 22, false, cell);
      const bystander = new Avatar('bystander', 30, 22, false, cell);

      robot['doAction']();

      expect(bystander.removed()).toBe(false);
    });

    it('does not kill other robots', () => {
      const cell = createArena();
      const robot = new Robot(10, 22, false, cell);
      const other = new Robot(16, 22, false, cell);

      robot['doAction']();

      expect(other.removed()).toBe(false);
    });
  });

  describe('assimilating a player', () => {
    function createAssimilationArena() {
      const hardlines = new Map<string, Session>();
      const { cell } = createTestCell(60, 50, {
        getZion: () => ({ getHardlines: () => hardlines }),
      } as unknown as Partial<World>);
      const cellData = cell.getCellData();
      CellBlock.init(cellData);
      Avatar.init(cellData);
      for (let x = 6; x <= 50; x += 2) new CellBlock(x, 30, false, cell); // floor.

      const robot = new Robot(10, 22, false, cell);
      const victim = new Avatar('borged', 16, 22, false, cell);
      const session = new Session(victim);
      hardlines.set('borged', session);
      return { cell, robot, victim, session };
    }

    it('turns the touched player into a robot standing where they died', () => {
      const { cell, robot, victim, session } = createAssimilationArena();

      robot['doAction']();

      expect(victim.removed()).toBe(true);
      expect(session.unplugged()).toBe(true);
      const body = session.getRobotBody();
      expect(body).toBeInstanceOf(Robot);
      expect(body).not.toBe(robot);
      expect(body!.removed()).toBe(false);
      expect(Math.abs(body!.getX() - victim.getX())).toBeLessThanOrEqual(1);
      expect(body!.getY()).toBe(victim.getY());
      expect(cell.getCellData().getSprites()).toContain(body);
    });

    it('keeps the new robot alive and patrolling instead of freezing', () => {
      const { robot, session } = createAssimilationArena();
      robot['doAction']();
      const body = session.getRobotBody()!;
      const startX = body.getX();

      for (let i = 0; i < 20; i++) body['doAction']();

      expect(body.getX()).not.toBe(startX);
      expect(body['xPower']).not.toBe(Physics.NONE);
    });

    it('only converts a victim once, even while their body lingers in the map for the redraw echo', () => {
      const { cell, robot } = createAssimilationArena();

      for (let i = 0; i < 6; i++) robot['doAction']();

      const robots = cell.getCellData().getSprites().filter((sprite) => sprite instanceof Robot);
      expect(robots).toHaveLength(2); // the original and one converted player
    });

    it('stops tracking the robot body once the player takes a new avatar', () => {
      const { cell, robot, session } = createAssimilationArena();
      robot['doAction']();
      expect(session.getRobotBody()).toBeDefined();

      session.plugin(new Avatar('borged', 40, 22, false, cell));

      expect(session.getRobotBody()).toBeUndefined();
    });

    it('does not leave a robot body when a player dies some other way', () => {
      const { victim, session } = createAssimilationArena();

      victim.die();

      expect(session.getRobotBody()).toBeUndefined();
    });

    it('forgets the body if that robot is later destroyed', () => {
      const { robot, session } = createAssimilationArena();
      robot['doAction']();

      session.getRobotBody()!.die();

      expect(session.getRobotBody()).toBeUndefined();
    });
  });
});
