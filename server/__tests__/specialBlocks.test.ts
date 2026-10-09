import { describe, expect, it } from 'vitest';
import type { Cell } from '../cell/cell';
import { Physics } from '../physics';
import { Session } from '../session';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Diamond } from '../sprite/diamond';
import { Explosion } from '../sprite/explosion';
import { GravityBlock } from '../sprite/gravityBlock';
import { Launcher, FUSE_FRAMES, KILL_RADIUS } from '../sprite/launcher';
import { Missile } from '../sprite/missile';
import { RainbowBlock, DIAMONDS_PER_BLOCK } from '../sprite/rainbowBlock';
import { Robot } from '../sprite/robot';
import { RocketLauncher } from '../sprite/rocketLauncher';
import { Shield } from '../sprite/shield';
import { ShieldBubble } from '../sprite/shieldBubble';
import type { Sprite } from '../sprite/sprite';
import { StickyBlock } from '../sprite/stickyBlock';
import { createTestCell, layFloor, layWall, PlainBlock } from './testHelpers';

const FLOOR_Y = 100;
const ON_FLOOR = FLOOR_Y - PlainBlock.SIZE;

function createScene(width = 160) {
  const { cell, physics } = createTestCell(width, 120);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  Avatar.init(cellData);
  PlainBlock.init(cellData);
  Launcher.init(cellData);
  Shield.init(cellData);
  GravityBlock.init(cellData);
  StickyBlock.init(cellData);
  RainbowBlock.init(cellData);
  Missile.init(cellData);
  RocketLauncher.init(cellData);
  layFloor(cell, FLOOR_Y, 0, width);
  return { cell, physics };
}

/** Runs one engine step for every sprite currently in the room. */
function stepAll(cell: Cell, frames = 1): void {
  for (let i = 0; i < frames; i++) {
    for (const sprite of cell.getCellData().getSprites()) sprite.process();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function spritesOf<T extends Sprite>(cell: Cell, type: abstract new (...args: any[]) => T): T[] {
  return cell.getCellData().getSprites().filter((sprite): sprite is T => sprite instanceof type);
}

describe('red launcher block', () => {
  it('stays harmless until an avatar touches it, then explodes after five seconds', () => {
    const { cell } = createScene();
    const launcher = new Launcher(30, ON_FLOOR, false, cell);

    for (let frame = 0; frame < FUSE_FRAMES * 2; frame++) launcher['doAction']();
    expect(launcher.isArmed()).toBe(false);
    expect(launcher.removed()).toBe(false);

    launcher.touch();
    for (let frame = 0; frame < FUSE_FRAMES - 1; frame++) launcher['doAction']();
    expect(launcher.removed()).toBe(false);

    launcher['doAction']();
    expect(launcher.removed()).toBe(true);
    expect(spritesOf(cell, Explosion)).toHaveLength(1);
  });

  it('is lit by an avatar standing against it, and by picking it up', () => {
    const { cell } = createScene();
    const touched = new Launcher(30, ON_FLOOR, false, cell);
    const avatar = new Avatar('toucher', 33 - 1, FLOOR_Y - Avatar.HEIGHT, false, cell);
    avatar['doAction']();
    expect(touched.isArmed()).toBe(true);

    const carried = new Launcher(80, ON_FLOOR, false, cell);
    const carrier = new Avatar('carrier', 80, ON_FLOOR - Avatar.HEIGHT, false, cell);
    carrier.pickUpMana();
    expect(carried.isArmed()).toBe(true);
  });

  it('keeps burning while it is carried and kills the carrier', () => {
    const { cell } = createScene();
    const launcher = new Launcher(80, ON_FLOOR, false, cell);
    const carrier = new Avatar('carrier', 80, ON_FLOOR - Avatar.HEIGHT, false, cell);
    carrier.pickUpMana();

    for (let frame = 0; frame < FUSE_FRAMES; frame++) launcher['doAction']();

    expect(launcher.removed()).toBe(true);
    expect(carrier.removed()).toBe(true);
  });

  it('kills avatars near it but not far ones, and shoves nearby blocks away', () => {
    const { cell } = createScene();
    const launcher = new Launcher(80, ON_FLOOR, false, cell);
    const near = new Avatar('near', 70, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const far = new Avatar('far', 80 + KILL_RADIUS + 20, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const blockNear = new PlainBlock(90, ON_FLOOR, false, cell);
    const blockFar = new PlainBlock(150, ON_FLOOR, false, cell);

    launcher.touch();
    for (let frame = 0; frame < FUSE_FRAMES; frame++) launcher['doAction']();
    expect(near.removed()).toBe(true);
    expect(far.removed()).toBe(false);

    for (let frame = 0; frame < 30; frame++) {
      blockNear['doAction']();
      blockFar['doAction']();
    }
    expect(blockNear.getX()).toBeGreaterThan(90 + 3);
    expect(Math.abs(blockFar.getX() - 150)).toBeLessThan(Math.abs(blockNear.getX() - 90));
  });

  it('does not kill through a wall', () => {
    const { cell } = createScene();
    layWall(cell, 90, FLOOR_Y - 30, FLOOR_Y);
    const launcher = new Launcher(80, ON_FLOOR, false, cell);
    const shielded = new Avatar('behind-wall', 94, FLOOR_Y - Avatar.HEIGHT, false, cell);

    launcher.touch();
    for (let frame = 0; frame < FUSE_FRAMES; frame++) launcher['doAction']();

    expect(launcher.removed()).toBe(true);
    expect(shielded.removed()).toBe(false);
  });
});

describe('green shield block', () => {
  it('wraps itself in a bubble that follows it around', () => {
    const { cell } = createScene();
    const shield = new Shield(60, 70, false, cell);
    const bubble = shield.getBubble()!;
    expect(bubble).toBeInstanceOf(ShieldBubble);

    for (let frame = 0; frame < 120; frame++) shield['doAction']();

    expect(shield.getY()).toBe(ON_FLOOR);
    expect(bubble.getX()).toBe(shield.getX() - 4);
    expect(bubble.getY()).toBe(shield.getY() - 4);
  });

  it('takes its bubble with it when it is destroyed', () => {
    const { cell } = createScene();
    const shield = new Shield(60, ON_FLOOR, false, cell);
    const bubble = shield.getBubble()!;

    shield.removePermanently();

    expect(bubble.removed()).toBe(true);
  });

  it('does not stop avatars or blocks (only rockets)', () => {
    const { cell, physics } = createScene();
    new Shield(60, ON_FLOOR, false, cell);
    const avatar = new Avatar('walker', 55, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const sealedWall = physics.move(avatar, Physics.RIGHT, Physics.NONE, 1);

    expect(sealedWall).toBe(true); // shoved the block itself (the bubble did not stop it)…
    const behind = new Avatar('bystander', 40, 60, false, cell);
    expect(physics.move(behind, Physics.RIGHT, Physics.NONE, 30)).toBe(true); // …and free to cross the bubble above it.
  });

  it('destroys a rocket flying into the bubble, protecting an avatar standing inside it', () => {
    const { cell } = createScene();
    new Shield(70, ON_FLOOR, false, cell);
    const protectedAvatar = new Avatar('protected', 76, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const rocket = new Missile(40, FLOOR_Y - 5, Physics.RIGHT, cell);

    for (let frame = 0; frame < 60; frame++) rocket['doAction']();

    expect(rocket.removed()).toBe(true);
    expect(protectedAvatar.removed()).toBe(false);
  });

  it('lets the same rocket kill the avatar without a shield', () => {
    const { cell } = createScene();
    const victim = new Avatar('victim', 76, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const rocket = new Missile(40, FLOOR_Y - 5, Physics.RIGHT, cell);

    for (let frame = 0; frame < 60; frame++) rocket['doAction']();

    expect(victim.removed()).toBe(true);
  });
});

describe('purple gravity block', () => {
  it('pulls other blocks toward itself, but only ones within range', () => {
    const { cell } = createScene();
    const purple = new GravityBlock(80, ON_FLOOR, false, cell);
    const near = new PlainBlock(55, ON_FLOOR, false, cell);
    const far = new PlainBlock(150, ON_FLOOR, false, cell);

    for (let frame = 0; frame < 200; frame++) {
      purple['doAction']();
      near['doAction']();
      far['doAction']();
    }

    expect(near.getX()).toBeGreaterThan(55 + 10);
    expect(purple.getX() - near.getX()).toBe(PlainBlock.SIZE); // ended up touching it.
    expect(far.getX()).toBe(150);
  });

  it('behaves like any other block otherwise (falls and can be shoved)', () => {
    const { cell } = createScene();
    const purple = new GravityBlock(80, 60, false, cell);

    for (let frame = 0; frame < 200; frame++) purple['doAction']();

    expect(purple.getY()).toBe(ON_FLOOR);
  });
});

describe('orange sticky block', () => {
  function stuckPair() {
    const { cell, physics } = createScene();
    const orange = new StickyBlock(60, ON_FLOOR, false, cell);
    const plain = new PlainBlock(63, ON_FLOOR, false, cell);
    orange['doAction']();
    return { cell, physics, orange, plain };
  }

  it('sticks to a block it touches, so the two move as one when either is shoved', () => {
    const { physics, orange, plain } = stuckPair();

    expect(physics.move(plain, Physics.RIGHT, Physics.NONE, 1)).toBe(true);
    expect(plain.getX()).toBe(64);
    expect(orange.getX()).toBe(61);

    expect(physics.move(orange, Physics.LEFT, Physics.NONE, 2)).toBe(true);
    expect(orange.getX()).toBe(59);
    expect(plain.getX()).toBe(62);
  });

  it('cannot be pulled apart: if one is blocked the other cannot move either', () => {
    const { cell, physics, orange, plain } = stuckPair();
    layWall(cell, 66, FLOOR_Y - 10, FLOOR_Y);

    expect(physics.move(orange, Physics.RIGHT, Physics.NONE, 1)).toBe(false);
    expect(orange.getX()).toBe(60);
    expect(plain.getX()).toBe(63);
  });

  it('keeps stuck blocks together when they fall, bounce or are thrown at', () => {
    const { cell } = createScene();
    const orange = new StickyBlock(60, 40, false, cell);
    const plain = new PlainBlock(63, 40, false, cell);

    for (let frame = 0; frame < 300; frame++) {
      orange['doAction']();
      plain['doAction']();
      expect(plain.getX() - orange.getX()).toBe(3);
      expect(plain.getY()).toBe(orange.getY());
    }

    expect(orange.getY()).toBe(ON_FLOOR);
  });

  it('cannot be picked up once stuck to something', () => {
    const { cell, orange } = stuckPair();
    const avatar = new Avatar('grabber', 61, ON_FLOOR - Avatar.HEIGHT, false, cell);

    expect(orange.canBePickedUp()).toBe(false);
    avatar.pickUpMana();
    expect(avatar.hasHandledMana()).toBe(false);
  });

  it('sticks to other orange blocks too, and a lone one can still be picked up', () => {
    const { cell } = createScene();
    const first = new StickyBlock(60, ON_FLOOR, false, cell);
    const second = new StickyBlock(63, ON_FLOOR, false, cell);
    first['doAction']();
    expect(first.canBePickedUp()).toBe(false);
    expect(second.canBePickedUp()).toBe(false);

    const lone = new StickyBlock(120, ON_FLOOR, false, cell);
    lone['doAction']();
    expect(lone.canBePickedUp()).toBe(true);
  });
});

describe('rainbow block', () => {
  function walledBox() {
    const scene = createScene(100);
    layWall(scene.cell, 20, 60, FLOOR_Y);
    layWall(scene.cell, 70, 60, FLOOR_Y);
    layFloor(scene.cell, 58, 20, 72);
    return scene;
  }

  it('ignores gravity and keeps crawling in one direction until it meets something', () => {
    const { cell } = walledBox();
    const rainbow = new RainbowBlock(30, 80, false, cell);
    rainbow['heading'] = 0; // right

    for (let frame = 0; frame < 20; frame++) rainbow['doAction']();

    expect(rainbow.getY()).toBe(80);
    expect(rainbow.getX()).toBe(50);
  });

  it('then follows the edge of what is in front of it, up the wall and around the ceiling', () => {
    const { cell } = walledBox();
    const rainbow = new RainbowBlock(30, 80, false, cell);
    rainbow['heading'] = 0;

    const path: Array<[number, number]> = [];
    for (let frame = 0; frame < 400; frame++) {
      rainbow['doAction']();
      path.push([rainbow.getX(), rainbow.getY()]);
    }

    const rightWallX = 70 - RainbowBlock.SIZE;
    const ceilingY = 58 + CellBlock.SIZE;
    expect(path.some(([x]) => x === rightWallX)).toBe(true);
    // Climbed the right wall…
    const wallClimb = path.filter(([x]) => x === rightWallX).map(([, y]) => y);
    expect(Math.min(...wallClimb)).toBeLessThan(Math.max(...wallClimb));
    // …crossed the ceiling…
    expect(path.some(([, y]) => y === ceilingY)).toBe(true);
    // …and always stayed inside the box.
    for (const [x, y] of path) {
      expect(x).toBeGreaterThanOrEqual(22);
      expect(x).toBeLessThanOrEqual(rightWallX);
      expect(y).toBeGreaterThanOrEqual(ceilingY);
      expect(y).toBeLessThanOrEqual(FLOOR_Y - RainbowBlock.SIZE);
    }
  });

  it('follows the edge of an avatar standing in its way', () => {
    const { cell } = createScene(100);
    const avatar = new Avatar('obstacle', 50, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const rainbow = new RainbowBlock(36, FLOOR_Y - 5, false, cell);
    rainbow['heading'] = 0;

    const path: Array<[number, number]> = [];
    for (let frame = 0; frame < 30; frame++) {
      rainbow['doAction']();
      path.push([rainbow.getX(), rainbow.getY()]);
    }

    // Stopped by the avatar's side, then crawled up it (rather than pushing through or turning back).
    const againstAvatar = path.filter(([x]) => x === avatar.getClippedX() - RainbowBlock.SIZE);
    expect(againstAvatar.length).toBeGreaterThan(3);
    expect(Math.min(...againstAvatar.map(([, y]) => y))).toBeLessThan(FLOOR_Y - 5);
    expect(avatar.removed()).toBe(false);
  });

  it('breaks on impact when thrown, into five collectible blue diamonds', () => {
    const { cell } = createScene(100);
    const rainbow = new RainbowBlock(60, ON_FLOOR, false, cell);
    const thrower = new Avatar('thrower', 60, ON_FLOOR - Avatar.HEIGHT, false, cell);
    thrower.pickUpMana();
    expect(thrower.hasHandledMana()).toBe(true);

    thrower.throwMana();
    for (let frame = 0; frame < 200 && !rainbow.removed(); frame++) rainbow['doAction']();

    expect(rainbow.removed()).toBe(true);
    expect(spritesOf(cell, Diamond)).toHaveLength(DIAMONDS_PER_BLOCK);
  });

  it('does not break when merely shoved against a wall', () => {
    const { cell, physics } = walledBox();
    const rainbow = new RainbowBlock(40, ON_FLOOR, false, cell);
    const avatar = new Avatar('shover', 40 - Avatar.WIDTH + 1, FLOOR_Y - Avatar.HEIGHT, false, cell);
    rainbow['heading'] = 1;

    physics.move(avatar, Physics.RIGHT, Physics.NONE, 1);
    for (let frame = 0; frame < 60; frame++) rainbow['doAction']();

    expect(rainbow.removed()).toBe(false);
    expect(spritesOf(cell, Diamond)).toHaveLength(0);
  });

  it('cannot be stuck to by an orange block', () => {
    const { cell } = createScene(100);
    const rainbow = new RainbowBlock(60, ON_FLOOR, false, cell);
    const orange = new StickyBlock(63, ON_FLOOR, false, cell);

    orange['doAction']();

    expect(rainbow.canBePickedUp()).toBe(true);
    expect(orange.canBePickedUp()).toBe(true);
  });
});

describe('diamonds', () => {
  it('fall, land on the floor, and are collected by the player who touches them', () => {
    const { cell } = createScene(100);
    const avatar = new Avatar('collector', 60, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const session = new Session(avatar);
    const diamond = new Diamond(40, 60, 0, 0, cell);

    for (let frame = 0; frame < 200; frame++) diamond['doAction']();
    expect(diamond.getY()).toBe(FLOOR_Y - Diamond.SIZE);
    expect(diamond.removed()).toBe(false);
    expect(session.getDiamonds()).toBe(0);

    cell.getCellData().moveTo(diamond, 62, FLOOR_Y - Diamond.SIZE);
    diamond['doAction']();

    expect(diamond.removed()).toBe(true);
    expect(session.getDiamonds()).toBe(1);
  });

  it('are not collected by robots', () => {
    const { cell } = createScene(100);
    new Robot(60, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const diamond = new Diamond(62, FLOOR_Y - Diamond.SIZE, 0, 0, cell);

    diamond['doAction']();

    expect(diamond.removed()).toBe(false);
  });

  it('bounce a little on landing', () => {
    const { cell } = createScene(100);
    const diamond = new Diamond(40, 20, 0, 0, cell);

    let landed = false;
    let rose = false;
    let previousY = diamond.getY();
    for (let frame = 0; frame < 200; frame++) {
      diamond['doAction']();
      if (diamond.getY() === FLOOR_Y - Diamond.SIZE) landed = true;
      if (landed && diamond.getY() < previousY) rose = true;
      previousY = diamond.getY();
    }

    expect(landed).toBe(true);
    expect(rose).toBe(true);
  });
});

describe('arcing rockets', () => {
  it('fly in an arc: up first, then curving back down, and end on a wall', () => {
    const { cell } = createScene();
    const rocket = new Missile(20, 70, Physics.RIGHT, cell, { vx: 0.9, vy: -1 });

    const ys: number[] = [];
    for (let frame = 0; frame < 300 && !rocket.removed(); frame++) {
      rocket['doAction']();
      ys.push(rocket.getY());
    }

    expect(Math.min(...ys)).toBeLessThan(70);
    expect(ys[ys.length - 1]).toBeGreaterThan(Math.min(...ys));
    expect(rocket.removed()).toBe(true);
    expect(rocket.getY()).toBeGreaterThanOrEqual(FLOOR_Y - 2);
  });

  it('are stopped by walls and blocks in their way', () => {
    const { cell } = createScene();
    layWall(cell, 50, FLOOR_Y - 30, FLOOR_Y);
    const victim = new Avatar('behind', 70, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const rocket = new Missile(30, FLOOR_Y - 5, Physics.RIGHT, cell);

    for (let frame = 0; frame < 100; frame++) rocket['doAction']();

    expect(rocket.removed()).toBe(true);
    expect(victim.removed()).toBe(false);
  });

  it('never hurt robots', () => {
    const { cell } = createScene();
    const robot = new Robot(70, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const rocket = new Missile(40, FLOOR_Y - 5, Physics.RIGHT, cell);

    for (let frame = 0; frame < 60; frame++) rocket['doAction']();

    expect(robot.removed()).toBe(false);
  });

  it('can be dry-run to check whether an arc reaches a target', () => {
    const { cell } = createScene();
    const cellData = cell.getCellData();
    const target = { x: 80, y: FLOOR_Y - Avatar.HEIGHT, width: Avatar.WIDTH, height: Avatar.HEIGHT };

    const frames = 60 / 0.9;
    const vy = (FLOOR_Y - 4 - (FLOOR_Y - 6) - (0.03 * frames * (frames + 1)) / 2) / frames;

    expect(Missile.pathReaches(cellData, 20, FLOOR_Y - 6, { vx: 0.9, vy }, target)).toBe(true);
    expect(Missile.pathReaches(cellData, 20, FLOOR_Y - 6, { vx: 0.9, vy: 2 }, target)).toBe(false);

    layWall(cell, 50, FLOOR_Y - 30, FLOOR_Y);
    expect(Missile.pathReaches(cellData, 20, FLOOR_Y - 6, { vx: 0.9, vy }, target)).toBe(false);
  });
});

describe('robot rocket launcher', () => {
  function duel(distance: number) {
    const { cell } = createScene(200);
    const robot = new Robot(30, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const player = new Avatar('target', 30 + distance, FLOOR_Y - Avatar.HEIGHT, false, cell);
    return { cell, robot, player };
  }

  it('stops, pulls out a launcher, fires an arcing rocket at a player in range and puts the launcher away', () => {
    const { cell, robot, player } = duel(45);

    let sawLauncher = false;
    let sawRocket = false;
    let stoppedWhileAiming = false;
    for (let frame = 0; frame < 400 && !player.removed(); frame++) {
      const xBefore = robot.getX();
      stepAll(cell);
      sawLauncher = sawLauncher || spritesOf(cell, RocketLauncher).some((l) => !l.removed());
      sawRocket = sawRocket || spritesOf(cell, Missile).length > 0;
      if (sawLauncher && !sawRocket && robot.getX() === xBefore) stoppedWhileAiming = true;
    }

    expect(sawLauncher).toBe(true);
    expect(stoppedWhileAiming).toBe(true);
    expect(sawRocket).toBe(true);
    expect(player.removed()).toBe(true);

    stepAll(cell, 120);
    expect(spritesOf(cell, RocketLauncher).filter((l) => !l.removed())).toHaveLength(0);
  });

  it('resumes patrolling once the launcher is put away', () => {
    const { cell, robot } = duel(45);

    for (let frame = 0; frame < 400; frame++) stepAll(cell);

    expect(robot['rocketPhase']).toBe('idle');
    expect(robot['xPower']).not.toBe(Physics.NONE);
  });

  it('does not fire at a player who is out of range', () => {
    const { cell } = duel(120);

    for (let frame = 0; frame < 200; frame++) stepAll(cell);

    expect(spritesOf(cell, Missile)).toHaveLength(0);
    expect(spritesOf(cell, RocketLauncher)).toHaveLength(0);
  });

  it('does not fire at a player too close for an arc', () => {
    const { cell } = duel(12);

    for (let frame = 0; frame < 100; frame++) {
      for (const sprite of cell.getCellData().getSprites()) {
        if (sprite instanceof Robot) expect(sprite['rocketPhase']).toBe('idle');
        sprite.process();
      }
    }
  });

  it('does not fire when a wall is in the way', () => {
    const { cell } = duel(45);
    layWall(cell, 55, FLOOR_Y - 40, FLOOR_Y);

    for (let frame = 0; frame < 150; frame++) stepAll(cell);

    expect(spritesOf(cell, Missile)).toHaveLength(0);
  });

  it('ignores other robots', () => {
    const { cell } = createScene(200);
    new Robot(30, FLOOR_Y - Avatar.HEIGHT, false, cell);
    new Robot(75, FLOOR_Y - Avatar.HEIGHT, false, cell);

    for (let frame = 0; frame < 150; frame++) stepAll(cell);

    expect(spritesOf(cell, Missile)).toHaveLength(0);
  });

  it('puts its launcher away if it is destroyed', () => {
    const { cell, robot } = duel(45);

    for (let frame = 0; frame < 120 && !robot['launcher']; frame++) stepAll(cell);
    const launcher = robot['launcher']!;
    expect(launcher).toBeDefined();

    robot.removePermanently();
    expect(launcher.removed()).toBe(true);
  });
});
