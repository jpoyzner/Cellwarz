import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyImagePaths, Minimap, PLANET_COLOR } from '../minimap';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classifyImagePaths', () => {
  it('classifies wall blocks, avatar/robot art, and everything else', () => {
    const kinds = classifyImagePaths([
      'images/blocks/blockC.png',
      'images/me/stand1.png',
      'images/me/run3.png',
      'images/mana/engine/engine.png',
      'images/doors/stargate/idle1.png',
      'images/projectiles/missile.png',
    ]);

    expect(kinds).toEqual(['wall', 'actor', 'actor', 'other', 'other', 'other']);
  });
});

describe('Minimap animation', () => {
  it('pauses and resumes the local-avatar pulse while hidden', () => {
    const radii: number[] = [];
    const mainContext = {
      arc: (_x: number, _y: number, radius: number) => radii.push(radius),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      stroke: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const layerContext = { fillRect: vi.fn() } as unknown as CanvasRenderingContext2D;
    const layerCanvas = {
      getContext: () => layerContext,
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal('document', { createElement: () => layerCanvas });

    const canvas = {
      getContext: () => mainContext,
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement;
    const minimap = new Minimap(canvas);
    minimap.setImagePaths(['images/blocks/block.png', 'images/me/stand.png']);

    const frame = (now: number) => ({
      sprites: {
        wall: [0, 0, 0] as [number, number, number],
        avatar: [1, 50, 50] as [number, number, number],
      },
      avatarSpriteIds: new Set<string>(['avatar']),
      localSpriteId: 'avatar',
      positionOf: () => ({ x: 50, y: 50 }),
      now,
    });

    minimap.draw(frame(1000));
    minimap.setPaused(true, 1000);
    minimap.draw(frame(2000));
    minimap.setPaused(false, 3000);
    minimap.draw(frame(3000));
    minimap.draw(frame(3200));

    expect(radii[1]).toBe(radii[0]);
    expect(radii[2]).toBe(radii[0]);
    expect(radii[3]).not.toBe(radii[0]);
  });
});

describe('Minimap planet', () => {
  it('draws the planet in its own colour, clipped to the map', () => {
    const fillStyles: string[] = [];
    const strokeStyles: string[] = [];
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      ellipse: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      rect: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
      set fillStyle(value: string) {
        fillStyles.push(value);
      },
      set strokeStyle(value: string) {
        strokeStyles.push(value);
      },
    } as unknown as CanvasRenderingContext2D;
    const layerCanvas = { getContext: () => context, height: 0, width: 0 } as unknown as HTMLCanvasElement;
    vi.stubGlobal('document', { createElement: () => layerCanvas });

    const minimap = new Minimap({ getContext: () => context, height: 0, width: 0 } as unknown as HTMLCanvasElement);
    minimap.setImagePaths(['images/blocks/block.png']);
    const sprites = { a: [0, 0, 0], b: [0, 1000, 600] } as Record<string, [number, number, number]>;
    const frame = {
      sprites,
      avatarSpriteIds: new Set<string>(),
      localSpriteId: undefined,
      positionOf: () => ({ x: 0, y: 0 }),
      now: 0,
    };

    minimap.draw(frame);
    expect(strokeStyles).not.toContain(PLANET_COLOR);

    minimap.draw({ ...frame, planet: { x: 500, y: 300, radius: 150 } });
    expect(strokeStyles).toContain(PLANET_COLOR);
    expect(fillStyles.some((style) => style.startsWith('rgba(255, 174, 26'))).toBe(true);
    expect(context.clip).toHaveBeenCalled();
  });
});

