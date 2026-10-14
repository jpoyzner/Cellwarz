import { describe, expect, it } from 'vitest';
import { getSprites } from '../jsonGenerator';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Explosion } from '../sprite/explosion';
import { Physics } from '../physics';
import { NinjaStar, STAR_GRAVITY, STAR_SPEED } from '../sprite/ninjaStar';
import { Robot } from '../sprite/robot';
import { ShieldBubble } from '../sprite/shieldBubble';
import { Shield } from '../sprite/shield';
import type { Sprite } from '../sprite/sprite';
import { UI } from '../ui';
import { createTestCell, layFloor, layWall, PlainBlock } from './testHelpers';

const FLOOR_Y = 80;
const SHIFT_KEY = 16;

function createScene() {
  const { cell, cellData } = createTestCell(160, 100);
  CellBlock.init(cellData);
  Avatar.init(cellData);
  PlainBlock.init(cellData);
  NinjaStar.init(cellData);
  Shield.init(cellData);
  ShieldBubble.init(cellData);
  layFloor(cell, FLOOR_Y, 0, 160);
  return cell;
}

function throwStarAt(cell: ReturnType<typeof createScene>, thrower: Avatar) {
  thrower.throwStar();
  return cell.getCellData().getSprites().find((sprite): sprite is NinjaStar => sprite instanceof NinjaStar && !sprite.removed())!;
}

function fly(star: NinjaStar, frames = 120): void {
  for (let frame = 0; frame < frames && !star.removed(); frame++) star['doAction']();
}

const liveExplosions = (cell: ReturnType<typeof createScene>) =>
  cell.getCellData().getSprites().filter((sprite: Sprite): sprite is Explosion => sprite instanceof Explosion && !sprite.removed());

describe('NinjaStar', () => {
  it('is thrown with Shift, straight ahead from the front of the avatar', () => {
    const cell = createScene();
    const avatar = new Avatar('thrower', 40, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const ui = new UI(avatar);

    ui.reactTo(SHIFT_KEY, true);
    const star = cell.getCellData().getSprites().find((sprite) => sprite instanceof NinjaStar)!;
    expect(star.getX()).toBe(40 + Avatar.WIDTH);

    star['doAction']();
    star['doAction']();
    expect(star.getX()).toBe(40 + Avatar.WIDTH + Math.round(STAR_SPEED * 2));
  });

  it('curves gently downward as it flies instead of travelling dead straight', () => {
    const cell = createScene();
    const avatar = new Avatar('thrower', 20, FLOOR_Y - Avatar.HEIGHT - 40, false, cell);
    const star = throwStarAt(cell, avatar);
    const startY = star.getY();

    for (let frame = 0; frame < 20; frame++) star['doAction']();
    const earlyDrop = star.getY() - startY;
    for (let frame = 0; frame < 30; frame++) star['doAction']();
    const laterDrop = star.getY() - startY;

    expect(STAR_GRAVITY).toBeGreaterThan(0);
    expect(earlyDrop).toBeGreaterThanOrEqual(0);
    expect(laterDrop).toBeGreaterThan(earlyDrop);
    // Only a little curve: a half-second flight sinks a handful of cells at most.
    expect(laterDrop).toBeLessThan(10);
  });

  it('flies left when the avatar faces left', () => {
    const cell = createScene();
    const avatar = new Avatar('lefty', 80, FLOOR_Y - Avatar.HEIGHT, false, cell);
    avatar.runLeft();
    avatar.stopRunning();

    const star = throwStarAt(cell, avatar);
    const startX = star.getX();
    star['doAction']();

    expect(star.getX()).toBeLessThan(startX);
  });

  it('is ignored while the avatar sleeps', () => {
    const cell = createScene();
    const avatar = new Avatar('sleepy', 40, FLOOR_Y - Avatar.HEIGHT, false, cell);
    avatar.fallAsleep();

    new UI(avatar).reactTo(SHIFT_KEY, true);

    expect(cell.getCellData().getSprites().some((sprite) => sprite instanceof NinjaStar)).toBe(false);
  });

  it('is rate-limited: a short cooldown, and only a few in flight at once', () => {
    const cell = createScene();
    const avatar = new Avatar('spammer', 20, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const count = () => cell.getCellData().getSprites().filter((sprite) => sprite instanceof NinjaStar && !sprite.removed()).length;

    avatar.throwStar();
    avatar.throwStar();
    expect(count()).toBe(1);

    for (let throws = 0; throws < 6; throws++) {
      for (let frame = 0; frame < 25; frame++) avatar['doAction']();
      avatar.throwStar();
    }
    expect(count()).toBe(3);
  });

  it('explodes small on a player, taking a fifth of their health instead of killing', () => {
    const cell = createScene();
    const thrower = new Avatar('thrower', 40, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const victim = new Avatar('victim', 70, FLOOR_Y - Avatar.HEIGHT, false, cell);

    const star = throwStarAt(cell, thrower);
    fly(star);

    expect(star.removed()).toBe(true);
    expect(victim.removed()).toBe(false);
    expect(victim.getHealth()).toBe(80);
    expect(thrower.getHealth()).toBe(100);
    const [explosion] = liveExplosions(cell);
    expect(explosion.getWidth()).toBe(Explosion.SMALL_SIZE);
    expect(Explosion.SMALL_SIZE).toBeLessThan(Explosion.SIZE);
  });

  it('hurts robots too, and passes harmlessly over its own thrower', () => {
    const cell = createScene();
    const thrower = new Avatar('thrower', 40, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const robot = new Robot(70, FLOOR_Y - Avatar.HEIGHT, false, cell);

    fly(throwStarAt(cell, thrower));

    expect(robot.getHealth()).toBe(80);
    expect(thrower.getHealth()).toBe(100);
  });

  it('explodes against a wall and shoves a nearby block', () => {
    const cell = createScene();
    layWall(cell, 70, FLOOR_Y - 30, FLOOR_Y);
    const block = new PlainBlock(62, FLOOR_Y - 3, false, cell);
    const thrower = new Avatar('thrower', 40, FLOOR_Y - Avatar.HEIGHT, false, cell);

    const star = throwStarAt(cell, thrower);
    fly(star);

    expect(star.removed()).toBe(true);
    expect(liveExplosions(cell)).toHaveLength(1);
    expect(block['body'].vx !== 0 || block['body'].vy !== 0).toBe(true);
  });

  it('is spent after a while and at the edge of the room', () => {
    const cell = createScene();
    const avatar = new Avatar('shooter', 20, FLOOR_Y - Avatar.HEIGHT, false, cell);

    // Launched high enough that its droop never reaches the floor.
    const star = new NinjaStar(20, 10, Physics.RIGHT, avatar, cell);
    fly(star, 300);

    expect(star.removed()).toBe(true);
    expect(liveExplosions(cell)).toHaveLength(0);
  });

  it('is swallowed by a shield bubble, protecting an avatar inside it', () => {
    const cell = createScene();
    new Shield(70, FLOOR_Y - 3, false, cell);
    const protectedAvatar = new Avatar('protected', 76, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const thrower = new Avatar('thrower', 40, FLOOR_Y - Avatar.HEIGHT, false, cell);

    const star = throwStarAt(cell, thrower);
    fly(star);

    expect(star.removed()).toBe(true);
    expect(protectedAvatar.getHealth()).toBe(100);
  });
});

describe('avatar health on the wire', () => {
  it('is only sent once the avatar is hurt, in both redraw and full-state payloads', () => {
    const cell = createScene();
    const avatar = new Avatar('patient', 40, FLOOR_Y - Avatar.HEIGHT, false, cell);
    const key = String(avatar.getCellIndex());

    expect(getSprites([avatar], false)[key]).toHaveLength(3);

    avatar.takeDamage(20);
    for (const addExtraInfo of [true, false]) {
      const sent = getSprites([avatar], addExtraInfo)[key];
      expect(sent[3]).toMatchObject({ '4': 80 });
    }
  });
});
