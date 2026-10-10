import { describe, expect, it } from 'vitest';
import { POINTS_PER_BLOCK, Session } from '../session';
import { getSprites } from '../jsonGenerator';
import { ESCAPE_KEY } from '../ui';
import { Avatar } from '../sprite/avatar';
import { createTestCell } from './testHelpers';

describe('Session score', () => {
  it('starts at zero and adds 20 points per block, surviving a re-plug into a new avatar', () => {
    const { cell, cellData } = createTestCell(50, 50);
    Avatar.init(cellData);
    const session = new Session(new Avatar('scorer', 10, 10, false, cell));

    expect(session.getScore()).toBe(0);

    session.addBlocks(3);
    expect(session.getScore()).toBe(3 * POINTS_PER_BLOCK);
    expect(POINTS_PER_BLOCK).toBe(20);

    session.plugin(new Avatar('scorer', 20, 10, false, cell));
    expect(session.getScore()).toBe(60);
  });
});

describe('Session diamonds', () => {
  it('starts at zero, counts collected diamonds, and survives a re-plug into a new avatar', () => {
    const { cell, cellData } = createTestCell(50, 50);
    Avatar.init(cellData);
    const session = new Session(new Avatar('collector', 10, 10, false, cell));

    expect(session.getDiamonds()).toBe(0);

    session.addDiamonds(2);
    session.addDiamonds(1);
    session.plugin(new Avatar('collector', 20, 10, false, cell));

    expect(session.getDiamonds()).toBe(3);
  });
});

describe('Session sleeping', () => {
  function setup() {
    const { cell, cellData } = createTestCell(50, 50);
    Avatar.init(cellData);
    const avatar = new Avatar('napper', 10, 10, false, cell);
    return { avatar, session: new Session(avatar), cell };
  }

  it('puts a living avatar to sleep (and stops its run) when its connection leaves, and wakes it on reattach', () => {
    const { avatar, session } = setup();
    const connection = {};
    session.attach(connection);
    avatar.runRight();

    session.detach(connection);
    expect(avatar.isSleeping()).toBe(true);
    expect(session.unplugged()).toBe(false); // asleep is not dead: Reattach! still finds it

    session.attach({});
    expect(avatar.isSleeping()).toBe(false);
  });

  it('ignores a stale connection leaving after a newer one has taken over', () => {
    const { avatar, session } = setup();
    const oldConnection = {};
    session.attach(oldConnection);
    session.attach({});

    session.detach(oldConnection);
    expect(avatar.isSleeping()).toBe(false);
  });

  it('does nothing for a dead player (no avatar left to put to sleep)', () => {
    const { session } = setup();
    const connection = {};
    session.attach(connection);
    session.unplug();

    expect(() => session.detach(connection)).not.toThrow();
  });

  it('reports sleeping avatars on the wire (only sleepers carry the flag), including in full-state payloads', () => {
    const { avatar } = setup();
    const sprites = [avatar];

    expect(getSprites(sprites, true)[String(avatar.getCellIndex())][3]).not.toHaveProperty('3'); // a fresh avatar only carries its name tag

    avatar.fallAsleep();
    const redraw = getSprites(sprites, true)[String(avatar.getCellIndex())];
    const full = getSprites(sprites, false)[String(avatar.getCellIndex())];
    expect(redraw[3]).toMatchObject({ '3': 1 });
    expect(full[3]).toEqual({ '3': 1 });
  });

  it('freezes a sleeper on one standing frame and makes it ignore input, until it wakes', () => {
    const { avatar, session } = setup();
    const ui = session.getUI();

    avatar.fallAsleep();
    const frame = avatar.getFrame();
    expect(frame).toBe(0);
    expect(avatar['animate']()).toBe(false);

    const xBefore = avatar.getX();
    ui.reactTo(39, true); // run right
    avatar['doAction']();
    expect(avatar.getX()).toBe(xBefore);

    avatar.wakeUp();
    expect(avatar['animate']()).toBe(true);
  });

  it('wakes a sleeping avatar when the player presses Space (and does not also pick anything up)', () => {
    const { avatar, session } = setup();
    const ui = session.getUI();
    avatar.fallAsleep();

    ui.reactTo(32, false);
    expect(avatar.isSleeping()).toBe(true);

    ui.reactTo(32, true);
    expect(avatar.isSleeping()).toBe(false);
    expect(avatar.hasHandledMana()).toBe(false);

    ui.reactTo(39, true); // awake again: input works
    expect(avatar['xPower']).toBe(1);
  });

  it('puts the avatar to sleep when the client sends Escape while alive', () => {
    const { avatar, session } = setup();

    session.getUI().reactTo(ESCAPE_KEY, true);

    expect(avatar.isSleeping()).toBe(true);
    expect(session.unplugged()).toBe(false);
  });
});

describe('Session look', () => {
  it('starts with no custom colours and bumps the shared revision only when they really change', () => {
    const { cell, cellData } = createTestCell(50, 50);
    Avatar.init(cellData);
    const session = new Session(new Avatar('stylist', 10, 10, false, cell));
    expect(session.getLook()).toBeUndefined();

    const before = Session.looksRevision;
    session.setLook({ headband: '#00f6ff', belt: '#ff2ea6' });
    expect(session.getLook()).toEqual({ headband: '#00f6ff', belt: '#ff2ea6' });
    expect(Session.looksRevision).toBe(before + 1);

    session.setLook({ headband: '#00f6ff', belt: '#ff2ea6' });
    expect(Session.looksRevision).toBe(before + 1);

    session.plugin(new Avatar('stylist', 20, 10, false, cell));
    expect(session.getLook()).toEqual({ headband: '#00f6ff', belt: '#ff2ea6' }); // colours outlive respawns

    session.setLook(undefined);
    expect(session.getLook()).toBeUndefined();
    expect(Session.looksRevision).toBe(before + 2);
  });
});
