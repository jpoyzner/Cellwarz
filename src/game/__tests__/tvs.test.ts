import { describe, expect, it } from 'vitest';
import { areChainsVisible, chainXs, coverCrop, isTvVisible, randomStartTime, visibleChainLinks } from '../tvs';

describe('coverCrop', () => {
  it('uses the whole video when the shapes match', () => {
    expect(coverCrop(360, 640, 180, 320)).toEqual({ sx: 0, sy: 0, sw: 360, sh: 640 });
  });

  it('crops the sides of a wider video to fill a taller screen', () => {
    const crop = coverCrop(1280, 720, 180, 320);
    expect(crop.sh).toBe(720);
    expect(crop.sw / crop.sh).toBeCloseTo(180 / 320);
    expect(crop.sx).toBeCloseTo((1280 - crop.sw) / 2);
  });

  it('crops the top and bottom of a taller video to fill a wider screen', () => {
    const crop = coverCrop(360, 640, 320, 180);
    expect(crop.sw).toBe(360);
    expect(crop.sw / crop.sh).toBeCloseTo(320 / 180);
    expect(crop.sy).toBeCloseTo((640 - crop.sh) / 2);
  });
});

describe('isTvVisible', () => {
  const tv = { x: 1000, y: 500, width: 192, height: 340, chainTopY: 64 };

  it('is visible when it overlaps the viewport', () => {
    expect(isTvVisible(tv, 900, 400, 800, 600)).toBe(true);
  });

  it('is hidden when it is entirely off-screen', () => {
    expect(isTvVisible(tv, 0, 0, 800, 600)).toBe(false);
    expect(isTvVisible(tv, 1400, 400, 800, 600)).toBe(false);
    expect(isTvVisible(tv, 900, 1000, 800, 600)).toBe(false);
  });
});

describe('TV chains', () => {
  const tv = { x: 1000, y: 1500, width: 200, height: 340, chainTopY: 64 };

  it('has two chains, symmetric and inside the TV', () => {
    const [left, right] = chainXs(tv);
    expect(left).toBeGreaterThan(tv.x);
    expect(right).toBeLessThan(tv.x + tv.width);
    expect(left - tv.x).toBeCloseTo(tv.x + tv.width - right);
  });

  it('shows the chains while only the middle of their run is on screen', () => {
    // Both the ceiling end and the TV itself are off-screen, but the chain column crosses the view.
    expect(isTvVisible(tv, 900, 600, 800, 400)).toBe(false);
    expect(areChainsVisible(tv, 900, 600, 800, 400)).toBe(true);
  });

  it('hides the chains when the view is horizontally or vertically clear of them', () => {
    expect(areChainsVisible(tv, 0, 600, 800, 400)).toBe(false);
    expect(areChainsVisible(tv, 900, 1600, 800, 400)).toBe(false);
  });
});

describe('visibleChainLinks', () => {
  it('only returns links inside the viewport, however long the chain is', () => {
    const links = visibleChainLinks(-5000, 2000, 800);
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThan(100);
    expect(links[0].y).toBeLessThanOrEqual(0);
    expect(links[links.length - 1].y).toBeLessThanOrEqual(800);
  });

  it('keeps each link attached to the same chain position as the camera moves (index parity is stable)', () => {
    const before = visibleChainLinks(100, 1000, 800);
    const after = visibleChainLinks(88, 1000, 800);
    expect(after[0].index).toBe(before[0].index);
    expect(after[0].y).toBe(before[0].y - 12);
  });

  it('stops before the TV end and returns nothing for a chain of no length', () => {
    const links = visibleChainLinks(0, 100, 800);
    // At most the frame's width (10px) of the last link may hide behind the TV, and no gap is left above it.
    expect(links[links.length - 1].y + 16).toBeLessThanOrEqual(110);
    expect(links[links.length - 1].y + 16).toBeGreaterThan(100 - 12);
    expect(visibleChainLinks(0, 0, 800)).toEqual([]);
  });
});

describe('randomStartTime', () => {
  it('picks a point spread across the video, but never within 10 seconds of the end', () => {
    expect(randomStartTime(300, () => 0)).toBe(0);
    expect(randomStartTime(300, () => 0.5)).toBe(145);
    expect(randomStartTime(300, () => 0.999999)).toBeLessThan(290);
  });

  it('starts at the beginning while the duration is unknown or very short', () => {
    expect(randomStartTime(Number.NaN, () => 0.5)).toBe(0);
    expect(randomStartTime(Number.POSITIVE_INFINITY, () => 0.5)).toBe(0);
    expect(randomStartTime(8, () => 0.5)).toBe(0);
  });
});
