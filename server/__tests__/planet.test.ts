import { describe, expect, it } from 'vitest';
import { MainRoom } from '../cell/mainRoom';
import { SimpleSmallCell } from '../cell/simpleSmallCell';
import { Engine } from '../engine';
import { PlanetField } from '../planet';
import { Physics } from '../physics';
import { getSprites } from '../jsonGenerator';
import { Avatar } from '../sprite/avatar';
import { Ice } from '../sprite/ice';
import { CellBlock } from '../sprite/cellBlock';
import type { World } from '../world';
import { createTestCell } from './testHelpers';

const AVATAR_HEIGHT_PX = 64;
const FPS = Engine.ENGINE_FRAMES_PER_SECOND;

function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function createScene(width = 200, height = 120) {
  const { cell, physics } = createTestCell(width, height);
  CellBlock.init(cell.getCellData());
  Avatar.init(cell.getCellData());
  Ice.init(cell.getCellData());
  return { cell, physics };
}

/** A field whose first planet is parked (its random draws pick the slowest speed) with its centre at the given pixels. */
function parkedField(x: number, y: number, pullEnabled = true) {
  const field = new PlanetField(1600, 960, AVATAR_HEIGHT_PX, pullEnabled, seeded([0, 0, 0, 0.5, 0.5, 0]));
  const planet = (field as unknown as { planet: { x: number; y: number; vx: number; vy: number } }).planet;
  Object.assign(planet, { x, y, vx: 0, vy: 0 });
  return { field };
}

describe('PlanetField', () => {
  it('flies one planet at a time across the room and then replaces it with a new random one', () => {
    const field = new PlanetField(1000, 800, AVATAR_HEIGHT_PX, false, seeded([0, 0, 0.1, 0.5, 0.5, 0.2]));
    const first = field.getState();

    expect(first.vx).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(0);
    expect(first.radius).toBeGreaterThanOrEqual(140);

    field.step();
    expect(field.getState().id).toBe(first.id);
    expect(field.getState().x).toBeCloseTo(first.x + first.vx / FPS);

    for (let i = 0; i < FPS * 600 && field.getState().id === first.id; i++) field.step();

    const next = field.getState();
    expect(next.id).toBe(first.id + 1);
    expect(next.x).toBeLessThan(0);
  });

  it('enters from either side with a random look, height and size', () => {
    const left = new PlanetField(1000, 800, AVATAR_HEIGHT_PX, false, seeded([0.5, 0.5, 0.1, 0.5, 0.5, 0.5])).getState();
    const right = new PlanetField(1000, 800, AVATAR_HEIGHT_PX, false, seeded([0.5, 0.5, 0.9, 0.5, 0.5, 0.5])).getState();

    expect(left.vx).toBeGreaterThan(0);
    expect(right.vx).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(1000);
    expect(left.y).toBeGreaterThanOrEqual(0.15 * 800);
    expect(left.y).toBeLessThanOrEqual(0.8 * 800);
  });

  it('pulls an avatar within 6 avatar heights of the surface toward the planet', () => {
    const { cell, physics } = createScene();
    const avatar = new Avatar('puller', 100, 60, false, cell);
    const cx = avatar.getXPixels() + 24;
    const cy = avatar.getYPixels() + 32;
    // Planet to the right, surface 100px (inside the 384px range) from the avatar's centre.
    const { field } = parkedField(cx + 150 + 100, cy);

    for (let i = 0; i < 10; i++) field.applyPull(avatar, physics);

    expect(avatar.getX()).toBeGreaterThan(100);
    expect(avatar.getY()).toBe(60);
  });

  it('ignores an avatar beyond the range', () => {
    const { cell, physics } = createScene();
    const avatar = new Avatar('far', 100, 60, false, cell);
    const { field } = parkedField(avatar.getXPixels() + 24 + 150 + 6 * AVATAR_HEIGHT_PX + 1, avatar.getYPixels() + 32);

    for (let i = 0; i < 20; i++) field.applyPull(avatar, physics);

    expect(avatar.getX()).toBe(100);
    expect(avatar.getY()).toBe(60);
  });

  it('is blocked by walls like any other movement', () => {
    const { cell, physics } = createScene();
    new CellBlock(110, 60, false, cell);
    const avatar = new Avatar('stopped', 100, 60, false, cell);
    const { field } = parkedField(avatar.getXPixels() + 24 + 250, avatar.getYPixels() + 32);

    for (let i = 0; i < 30; i++) field.applyPull(avatar, physics);

    expect(avatar.getX()).toBeLessThan(110);
  });

  it('pulls much harder inside the planet than just outside it', () => {
    const outside = createScene();
    const inside = createScene();
    const a = new Avatar('outside', 100, 60, false, outside.cell);
    const b = new Avatar('inside', 100, 60, false, inside.cell);
    // Surface 5px away vs. centre 80px away (radius 150); both pulled sideways toward a planet to the right.
    const outsideField = parkedField(a.getXPixels() + 24 + 155, a.getYPixels() + 32).field;
    const insideField = parkedField(b.getXPixels() + 24 + 80, b.getYPixels() + 32).field;

    for (let i = 0; i < 4; i++) {
      outsideField.applyPull(a, outside.physics);
      insideField.applyPull(b, inside.physics);
    }

    expect(b.getX() - 100).toBeGreaterThan(a.getX() - 100);
    expect(b.getX() - 100).toBeGreaterThanOrEqual(4);
  });

  it('lifts a sprite that is inside the planet, since the pull there beats gravity', () => {
    const { cell, physics } = createScene();
    const avatar = new Avatar('lifted', 40, 60, false, cell);
    // Planet directly above: its centre 80px from the avatar's, so the avatar is within the planet's disc.
    const { field } = parkedField(avatar.getXPixels() + 24, avatar.getYPixels() + 32 - 80);

    for (let i = 0; i < 3; i++) field.applyPull(avatar, physics);

    expect(avatar.getY()).toBeLessThan(60);
  });

  it('never lifts a sprite against gravity, even right at the surface', () => {
    const { cell, physics } = createScene();
    const avatar = new Avatar('grounded', 40, 60, false, cell);
    // Planet directly above, its surface 20px from the avatar's centre.
    const { field } = parkedField(avatar.getXPixels() + 24, avatar.getYPixels() + 32 - 150 - 20);

    for (let i = 0; i < 20; i++) field.applyPull(avatar, physics);

    expect(avatar.getY()).toBe(60);
  });

  describe('swallowing at the core', () => {
    const FRAMES = FPS;

    function swallowedAvatar() {
      const { cell, physics } = createScene();
      const avatar = new Avatar('doomed', 100, 60, false, cell);
      // Planet (radius 150) centred 20px from the avatar's centre, inside its 22.5px core.
      const { field } = parkedField(avatar.getXPixels() + 24 + 20, avatar.getYPixels() + 32);
      return { avatar, field, physics, cell };
    }

    it('starts shrinking a sprite that reaches the core, and shrinks it a little every frame', () => {
      const { avatar, field, physics } = swallowedAvatar();
      expect(avatar.getConsumeScale()).toBeUndefined();

      field.applyPull(avatar, physics);
      expect(avatar.getConsumeScale()).toBe(1);

      let last = 1;
      for (let i = 0; i < FRAMES - 1; i++) {
        field.advanceConsumed(physics);
        const scale = avatar.getConsumeScale()!;
        expect(scale).toBeLessThan(last);
        last = scale;
      }
      expect(avatar.removed()).toBe(false);
      expect(last).toBeGreaterThan(0);
    });

    it('slides the sprite to the planet centre while shrinking, ignoring its own gravity', () => {
      const { avatar, field, physics } = swallowedAvatar();
      const targetX = (avatar.getXPixels() + 24 + 20 - 24) / 8;
      field.applyPull(avatar, physics);

      for (let i = 0; i < FRAMES - 1; i++) {
        avatar.process();
        field.advanceConsumed(physics);
      }

      expect(Math.abs(avatar.getX() - targetX)).toBeLessThanOrEqual(1);
      expect(Math.abs(avatar.getY() - 60)).toBeLessThanOrEqual(1);
    });

    it('kills an avatar once it has shrunk away', () => {
      const { avatar, field, physics } = swallowedAvatar();
      field.applyPull(avatar, physics);

      for (let i = 0; i < FRAMES; i++) field.advanceConsumed(physics);

      expect(avatar.removed()).toBe(true);
    });

    it('removes a mana block from the game once it has shrunk away', () => {
      const { cell, physics } = createScene();
      const ice = new Ice(100, 60, false, cell);
      const { field } = parkedField(ice.getXPixels() + 12, ice.getYPixels() + 12);

      field.applyPull(ice, physics);
      expect(ice.getConsumeScale()).toBe(1);
      for (let i = 0; i < FRAMES; i++) field.advanceConsumed(physics);

      expect(ice.removed()).toBe(true);
    });

    it('does not swallow a sprite that only gets close to the surface', () => {
      const { cell, physics } = createScene();
      const avatar = new Avatar('safe', 100, 60, false, cell);
      const { field } = parkedField(avatar.getXPixels() + 24 + 100, avatar.getYPixels() + 32);

      // Pulled only part of the way in (an unobstructed sprite would eventually reach the core).
      for (let i = 0; i < 5; i++) field.applyPull(avatar, physics);

      expect(avatar.getX()).toBeGreaterThan(100);
      expect(avatar.getConsumeScale()).toBeUndefined();
    });

    it('reports the shrink to clients as extra info on the sprite', () => {
      const { avatar, field, physics } = swallowedAvatar();
      field.applyPull(avatar, physics);
      field.advanceConsumed(physics);
      const scale = avatar.getConsumeScale()!;

      const sent = getSprites([avatar], true)[String(avatar.getCellIndex())];
      expect(sent[3]).toMatchObject({ '2': Math.round(scale * 100) / 100 });
      expect(getSprites([avatar], false)[String(avatar.getCellIndex())]).toHaveLength(3);
    });

    it('leaves swallowing off when pull is disabled', () => {
      const { cell, physics } = createScene();
      const avatar = new Avatar('immune2', 100, 60, false, cell);
      const { field } = parkedField(avatar.getXPixels() + 24 + 20, avatar.getYPixels() + 32, false);

      field.applyPull(avatar, physics);

      expect(avatar.getConsumeScale()).toBeUndefined();
    });
  });

  it('does nothing when pull is disabled', () => {
    const { cell, physics } = createScene();
    const avatar = new Avatar('immune', 100, 60, false, cell);
    const { field } = parkedField(avatar.getXPixels() + 24 + 250, avatar.getYPixels() + 32, false);

    for (let i = 0; i < 20; i++) field.applyPull(avatar, physics);

    expect(avatar.getX()).toBe(100);
  });
});

describe('Cell planets', () => {
  it('gives MainRoom a planet and pulls its avatars, but not other rooms', () => {
    const physics = new Physics();
    const world = { getPhysics: () => physics, getZion: () => ({ getHardlines: () => new Map() }) } as unknown as World;
    const room = new MainRoom(world);
    new Engine(room);
    room.init();

    expect(room.getPlanet()?.id).toBe(1);

    const before = room.getPlanet()!.x;
    room.process();
    expect(room.getPlanet()!.x).toBeCloseTo(before + room.getPlanet()!.vx / FPS);

    expect(new SimpleSmallCell(world).getPlanet()).toBeUndefined();
  });
});
