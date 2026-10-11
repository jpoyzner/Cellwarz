import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cell } from '../cell/cell';
import { Engine } from '../engine';

function createFakeCell(processSpy: () => void): Cell {
  return {
    getCellData: () => ({ getSprites: () => [] }),
    process: processSpy,
    setEngine: () => {},
  } as unknown as Cell;
}

describe('Engine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The fixed-timestep accumulator (vs. assuming every setInterval firing is exactly 1000/48ms) is what lets
  // the sim recover cleanly from a delayed/coalesced callback instead of silently running slower — exercising
  // that recovery precisely needs a real stalled event loop, so this just locks in normal-timing behavior;
  // rounding in how fake timers schedule a ~20.83ms period means the exact count can be 4 or 5 either way.
  it('runs roughly one simulation step per tick under normal timing', () => {
    vi.useFakeTimers();
    const processSpy = vi.fn();
    new Engine(createFakeCell(processSpy)).start();

    vi.advanceTimersByTime((1000 / Engine.ENGINE_FRAMES_PER_SECOND) * 5);

    expect(processSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(processSpy.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('hands out every step\'s redraws exactly once to a connection that sends less often than the engine steps', () => {
    const sprites = [0, 1, 2].map((n) => ({ process: () => {}, needsRedraw: () => n !== 1, n }));
    const cell = {
      getCellData: () => ({ getSprites: () => sprites }),
      process: () => {},
      setEngine: () => {},
    } as unknown as Cell;
    const engine = new Engine(cell);

    engine['step']();
    const afterFirst = engine.getStepCount();
    sprites[1].needsRedraw = () => true; // only changes in the second step
    sprites[0].needsRedraw = () => false;
    engine['step']();

    expect(engine.getRedrawSpritesSince(afterFirst - 1)).toHaveLength(3); // both steps' sprites, each once
    expect(engine.getRedrawSpritesSince(afterFirst)).toHaveLength(2); // only the second step's
    expect(engine.getRedrawSpritesSince(engine.getStepCount())).toEqual([]);
  });
});
