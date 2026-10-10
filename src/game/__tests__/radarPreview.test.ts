import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RadarPreview } from '../radarPreview';

const IMAGE_PATHS = ['images/blocks/blockC.png', 'images/me/stand1.png'];

function fullState(overrides: Record<string, unknown> = {}) {
  return {
    connect: '0',
    sprites: { 1: [0, 0, 0], 2: [0, 16, 0], 7: [1, 100, 200], 8: [1, 300, 200] },
    avatars: { alice: 7 },
    imagePaths: IMAGE_PATHS,
    planet: null,
    ...overrides,
  };
}

describe('RadarPreview', () => {
  let radar: RadarPreview;

  beforeEach(() => {
    vi.stubGlobal('document', { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
    radar = new RadarPreview({} as HTMLCanvasElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('knows who has a living avatar from the full state (ids arrive as numbers)', () => {
    radar.handleMessage(fullState());

    expect(radar.hasLivingAvatar('alice')).toBe(true);
    expect(radar.hasLivingAvatar('bob')).toBe(false);
    expect(radar.hasLivingAvatar('')).toBe(false);
    expect(radar.hasLivingAvatar('constructor')).toBe(false);
  });

  it('counts pilots (named avatars) apart from robots (actors with no name)', () => {
    radar.handleMessage(fullState());
    expect(radar.counts()).toEqual({ pilots: 1, robots: 1 });
  });

  it('follows redraw frames: a newly named avatar appears, a deleted one goes', () => {
    radar.handleMessage(fullState());

    radar.handleMessage({ 9: [1, 50, 60, { 0: 'bob' }] });
    expect(radar.hasLivingAvatar('bob')).toBe(true);
    expect(radar.counts().pilots).toBe(2);

    radar.handleMessage({ 7: [-1] });
    expect(radar.hasLivingAvatar('alice')).toBe(false);
    expect(radar.counts()).toEqual({ pilots: 1, robots: 1 });
  });

  it('moves sprites on frames and ignores the one-shot messages that are not frames', () => {
    radar.handleMessage(fullState());
    radar.handleMessage({ 7: [1, 120, 210] });
    expect(radar.sprites['7']).toEqual([1, 120, 210]);

    radar.handleMessage({ looks: { alice: ['#00f6ff', '#ff2ea6'] } });
    radar.handleMessage({ diamonds: 3 });
    radar.handleMessage({ died: true });
    expect(Object.keys(radar.sprites)).not.toContain('looks');
    expect(radar.counts()).toEqual({ pilots: 1, robots: 1 });
  });

  it('tracks the planet from the full state and its one-shot updates', () => {
    const planet = { id: 1, x: 10, y: 20, vx: 1, vy: 0, radius: 50, seed: 3 };
    radar.handleMessage(fullState({ planet }));
    expect(radar.planet).toEqual(planet);

    radar.handleMessage({ planet: null });
    expect(radar.planet).toBeUndefined();
  });
});
