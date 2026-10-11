import { describe, expect, it } from 'vitest';
import { Physics } from '../physics';
import { Session } from '../session';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Launcher } from '../sprite/launcher';
import { Missile } from '../sprite/missile';
import { NinjaStar } from '../sprite/ninjaStar';
import { createTestCell, layFloor, PlainBlock } from './testHelpers';

const FLOOR_Y = 100;

/** A room whose zion knows the players' sessions, so a dying avatar can leave its cause of death on its own. */
function createScene() {
  const hardlines = new Map<string, Session>();
  const { cell, cellData } = createTestCell(160, 120, {
    getZion: () => ({ getHardlines: () => hardlines }),
  } as never);
  CellBlock.init(cellData);
  Avatar.init(cellData);
  PlainBlock.init(cellData);
  Launcher.init(cellData);
  Missile.init(cellData);
  NinjaStar.init(cellData);
  layFloor(cell, FLOOR_Y, 0, 160);

  const victim = new Avatar('victim', 60, FLOOR_Y - Avatar.HEIGHT, false, cell);
  const session = new Session(victim);
  hardlines.set('victim', session);
  return { cell, victim, session };
}

describe('cause of death', () => {
  it('a red block blast names itself', () => {
    const { cell, victim, session } = createScene();
    const launcher = new Launcher(60 + Avatar.WIDTH, FLOOR_Y - PlainBlock.SIZE, false, cell);
    launcher.touch();

    for (let frame = 0; frame < 400 && !launcher.removed(); frame++) launcher['doAction']();

    expect(victim.removed()).toBe(true);
    expect(session.getDeathCause()).toBe('blast');
  });

  it('only the rocket hit that finishes the health is the cause', () => {
    const { cell, victim, session } = createScene();
    victim.takeDamage(60);
    const rocket = new Missile(40, FLOOR_Y - 5, Physics.RIGHT, cell);

    for (let frame = 0; frame < 60 && !rocket.removed(); frame++) rocket['doAction']();
    expect(victim.removed()).toBe(false);
    expect(session.getDeathCause()).toBeUndefined();

    const second = new Missile(40, FLOOR_Y - 5, Physics.RIGHT, cell);
    for (let frame = 0; frame < 60 && !second.removed(); frame++) second['doAction']();

    expect(victim.removed()).toBe(true);
    expect(session.getDeathCause()).toBe('rocket');
  });

  it('a ninja star names itself', () => {
    const { cell, victim, session } = createScene();
    victim.takeDamage(80);
    const thrower = new Avatar('thrower', 20, FLOOR_Y - Avatar.HEIGHT, false, cell);
    thrower.throwStar();
    const star = cell.getCellData().getSprites().find((sprite): sprite is NinjaStar => sprite instanceof NinjaStar)!;

    for (let frame = 0; frame < 120 && !star.removed(); frame++) star['doAction']();

    expect(victim.removed()).toBe(true);
    expect(session.getDeathCause()).toBe('star');
  });

  it('being swallowed by the planet names itself', () => {
    const { victim, session } = createScene();
    victim.onConsumed();
    expect(session.getDeathCause()).toBe('planet');
  });

  it('a death with no named cause (a robot assimilation) leaves none, and a new avatar clears an old one', () => {
    const { cell, victim, session } = createScene();
    session.setDeathCause('blast');
    victim.die();
    expect(session.getDeathCause()).toBeUndefined();

    session.setDeathCause('rocket');
    session.plugin(new Avatar('victim', 100, FLOOR_Y - Avatar.HEIGHT, false, cell));
    expect(session.getDeathCause()).toBeUndefined();
  });
});
