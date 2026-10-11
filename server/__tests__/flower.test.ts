import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import { CellBlock } from '../sprite/cellBlock';
import { Flower, SPIT_INTERVAL_FRAMES } from '../sprite/flower';
import { Ice } from '../sprite/ice';
import { Launcher } from '../sprite/launcher';
import { Mana } from '../sprite/mana';
import { MAX_RAINBOW_BLOCKS, RainbowBlock } from '../sprite/rainbowBlock';
import { Shield } from '../sprite/shield';
import { StickyBlock } from '../sprite/stickyBlock';
import { Thruster } from '../sprite/thruster';
import { createTestCell, PlainBlock } from './testHelpers';

const FLOWER_X = 60;
const FLOWER_Y = 10;

function createScene(spitsBlocks = true) {
  const { cell } = createTestCell(160, 120);
  const cellData = cell.getCellData();
  CellBlock.init(cellData);
  PlainBlock.init(cellData);
  Thruster.init(cellData);
  Launcher.init(cellData);
  Ice.init(cellData);
  Shield.init(cellData);
  StickyBlock.init(cellData);
  RainbowBlock.init(cellData);
  Flower.init(cellData);
  const flower = new Flower(FLOWER_X, FLOWER_Y, false, cell, spitsBlocks);
  return { cell, flower };
}

function manaIn(cell: Cell): Mana[] {
  return cell.getCellData().getSprites().filter((sprite): sprite is Mana => sprite instanceof Mana);
}

function stepFlower(flower: Flower, frames: number): void {
  for (let i = 0; i < frames; i++) flower.process();
}

function removeFully(block: Mana): void {
  block.removePermanently();
  for (let i = 0; i < 20; i++) block.process();
}

const velocityOf = (block: Mana): { vx: number; vy: number } => {
  const body = (block as unknown as { body: { vx: number; vy: number } }).body;
  return { vx: body.vx, vy: body.vy };
};

/** Fires one spit with `Math.random` returning these values in order: angle (picked as the head turns), block kind, then speed. */
function spitWith(kind: number, angle: number, speed: number): Mana {
  const { cell, flower } = createScene();
  vi.spyOn(Math, 'random').mockReturnValueOnce(angle).mockReturnValueOnce(kind).mockReturnValueOnce(speed);
  stepFlower(flower, SPIT_INTERVAL_FRAMES);
  const blocks = manaIn(cell);
  expect(blocks).toHaveLength(1);
  return blocks[0];
}

describe('flower', () => {
  afterEach(() => vi.restoreAllMocks());

  it('spits one block out of its mouth every 30 seconds, and none before that', () => {
    const { cell, flower } = createScene();
    // A yellow first block: a green one's bubble would linger over the mouth after the block itself is cleared.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0);

    stepFlower(flower, SPIT_INTERVAL_FRAMES - 1);
    expect(manaIn(cell)).toHaveLength(0);

    stepFlower(flower, 1);
    const [block] = manaIn(cell);
    expect(manaIn(cell)).toHaveLength(1);

    // Cleared away, the next one comes a full interval later.
    removeFully(block);
    stepFlower(flower, SPIT_INTERVAL_FRAMES - 1);
    expect(manaIn(cell)).toHaveLength(0);
    stepFlower(flower, 1);
    expect(manaIn(cell)).toHaveLength(1);
  });

  it('starts the block at the mouth, wherever the head is facing', () => {
    const centreOf = (block: Mana) => ({ x: block.getX() + Mana.SIZE / 2, y: block.getY() + Mana.SIZE / 2 });
    const stemEnd = { x: FLOWER_X + 6, y: FLOWER_Y + 7.25 };

    const down = centreOf(spitWith(0, 0.5, 0.5));
    expect(Math.abs(down.x - stemEnd.x)).toBeLessThanOrEqual(1);
    expect(down.y - stemEnd.y).toBeGreaterThan(3);

    vi.restoreAllMocks();
    const right = centreOf(spitWith(0, 0, 0.5));
    expect(right.x - stemEnd.x).toBeGreaterThan(3);
    expect(Math.abs(right.y - stemEnd.y)).toBeLessThanOrEqual(1);

    vi.restoreAllMocks();
    const left = centreOf(spitWith(0, 0.9999, 0.5));
    expect(stemEnd.x - left.x).toBeGreaterThan(3);
  });

  it('turns its head the way it will spit a second beforehand, then holds that pose for the spit', () => {
    const { cell, flower } = createScene();
    // 45 degrees, then a yellow block at speed 2.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0).mockReturnValueOnce(0.5);

    stepFlower(flower, SPIT_INTERVAL_FRAMES - Engine.EVERY_SECOND - 1);
    expect(flower.getAnimationSequence()).toBe('none');

    stepFlower(flower, 1);
    expect(flower.getAnimationSequence()).toBe('charge45');
    stepFlower(flower, Engine.EVERY_SECOND - 1);
    expect(flower.getAnimationSequence()).toBe('charge45');
    expect(manaIn(cell)).toHaveLength(0);

    stepFlower(flower, 1);
    expect(flower.getAnimationSequence()).toBe('spit45');
    const { vx, vy } = velocityOf(manaIn(cell)[0]);
    expect(vx).toBeCloseTo(vy);
    expect(vx).toBeGreaterThan(0);

    stepFlower(flower, Engine.EVERY_SECOND / 2);
    expect(flower.getAnimationSequence()).toBe('none');
  });

  it('shows the nearest of its head poses, from facing right through straight down to facing left', () => {
    const poseFor = (angle: number): string => {
      vi.restoreAllMocks();
      const { flower } = createScene();
      vi.spyOn(Math, 'random').mockReturnValueOnce(angle);
      stepFlower(flower, SPIT_INTERVAL_FRAMES - Engine.EVERY_SECOND);
      return flower.getAnimationSequence();
    };

    expect(poseFor(0)).toBe('charge0');
    expect(poseFor(0.5)).toBe('charge90');
    expect(poseFor(0.9999)).toBe('charge180');
    expect(poseFor(0.3)).toBe('charge60');
    expect(poseFor(0.7)).toBe('charge120');
  });

  it('fires at a random angle across the half circle below it and a random speed', () => {
    const left = velocityOf(spitWith(0, 0.75, 0.5));
    vi.restoreAllMocks();
    const right = velocityOf(spitWith(0, 0.25, 0.5));
    vi.restoreAllMocks();
    const down = velocityOf(spitWith(0, 0.5, 1));

    expect(left.vx).toBeLessThan(0);
    expect(right.vx).toBeGreaterThan(0);
    expect(left.vx).toBeCloseTo(-right.vx);
    expect(left.vy).toBeGreaterThan(0);
    expect(Math.hypot(right.vx, right.vy)).toBeCloseTo(2);
    expect(down.vx).toBeCloseTo(0);
    expect(down.vy).toBeCloseTo(3);
  });

  it('never fires upward or outside the speed range', () => {
    for (let i = 0; i < 25; i++) {
      const { cell, flower } = createScene();
      stepFlower(flower, SPIT_INTERVAL_FRAMES);
      const { vx, vy } = velocityOf(manaIn(cell)[0]);
      expect(vy).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(vx, vy)).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(Math.hypot(vx, vy)).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  it('makes every kind of block, not one type', () => {
    const kinds = [Thruster, Launcher, Ice, Shield, StickyBlock, RainbowBlock];

    kinds.forEach((kind, index) => {
      vi.restoreAllMocks();
      expect(spitWith((index + 0.5) / kinds.length, 0.5, 0.5)).toBeInstanceOf(kind);
    });
  });

  it('stops making rainbow blocks once the room holds the maximum, and resumes when one is gone', () => {
    const { cell, flower } = createScene();
    const rainbows = Array.from({ length: MAX_RAINBOW_BLOCKS }, (_, i) => new RainbowBlock(5 * i, 100, false, cell));

    // 0.99 would pick the rainbow block, the last kind, if it were allowed.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.99);
    stepFlower(flower, SPIT_INTERVAL_FRAMES);
    const spat = manaIn(cell).filter((block) => !rainbows.includes(block as RainbowBlock));
    expect(spat).toHaveLength(1);
    expect(spat[0]).not.toBeInstanceOf(RainbowBlock);

    removeFully(spat[0]);
    removeFully(rainbows[0]);
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.99);
    stepFlower(flower, SPIT_INTERVAL_FRAMES);
    expect(manaIn(cell).filter((block) => block instanceof RainbowBlock && !rainbows.includes(block))).toHaveLength(1);
  });

  it('does not make the block count as a throw, so a rainbow block survives landing', () => {
    expect(spitWith(0.99, 0.5, 0.5).isThrown()).toBe(false);
  });

  it('waits for the mouth to be clear instead of skipping the spit', () => {
    const { cell, flower } = createScene();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);
    // Where the mouth's block lands when the head faces straight down.
    const plug = new PlainBlock(FLOWER_X + 5, FLOWER_Y + 10, false, cell);

    stepFlower(flower, SPIT_INTERVAL_FRAMES + 20);
    expect(manaIn(cell)).toEqual([plug]);

    removeFully(plug);
    stepFlower(flower, 1);
    expect(manaIn(cell)).toHaveLength(1);
  });

  it('is only decorative when spitting is switched off', () => {
    const { cell, flower } = createScene(false);

    stepFlower(flower, SPIT_INTERVAL_FRAMES * 2);
    expect(manaIn(cell)).toHaveLength(0);
  });
});
