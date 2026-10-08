import { describe, expect, it } from 'vitest';
import { glowColorForPath, isHeadband, recolorHeadband, steelify } from '../neonSprites';

function pixels(rgba: number[], width: number, height: number) {
  return { data: new Uint8ClampedArray(rgba), width, height };
}

describe('neonSprites', () => {
  it('recognizes only strongly red opaque pixels as the headband', () => {
    expect(isHeadband(220, 20, 20, 255)).toBe(true);
    expect(isHeadband(220, 20, 20, 0)).toBe(false);
    expect(isHeadband(20, 20, 20, 255)).toBe(false);
    expect(isHeadband(220, 200, 20, 255)).toBe(false);
  });

  it('recolors headband pixels and can isolate them as a glow layer', () => {
    const red = [220, 20, 20, 255];
    const black = [10, 10, 10, 255];

    const body = pixels([...red, ...black], 2, 1);
    recolorHeadband(body, [0, 246, 255]);
    expect(Array.from(body.data)).toEqual([0, 246, 255, 255, 10, 10, 10, 255]);

    const glow = pixels([...red, ...black], 2, 1);
    recolorHeadband(glow, [0, 246, 255], true);
    expect(Array.from(glow.data)).toEqual([0, 246, 255, 255, 10, 10, 10, 0]);
  });

  it('turns a block tile into dark steel with a cyan-tinted rim and leaves transparent pixels alone', () => {
    const size = 8;
    const data: number[] = [];
    for (let i = 0; i < size * size; i++) data.push(60, 90, 200, 255);
    data.splice(0, 4, 0, 0, 0, 0);
    const tile = pixels(data, size, size);

    steelify(tile);

    expect(tile.data[3]).toBe(0);
    const center = (5 * size + 5) * 4;
    expect(tile.data[center]).toBeLessThan(80);
    expect(tile.data[center + 2]).toBeLessThan(160);
    const rim = (0 * size + 3) * 4;
    expect(tile.data[rim + 2]).toBeGreaterThan(tile.data[center + 2]);
    expect(tile.data[rim + 1]).toBeGreaterThan(tile.data[center + 1]);
  });

  it('picks neon glow colors from the image path and none for plain art', () => {
    expect(glowColorForPath('/images/doors/stargate/idle1.png')).toBe('#00f6ff');
    expect(glowColorForPath('/images/doors/entrance/idle1.png')).toBe('#ff2ea6');
    expect(glowColorForPath('/images/mana/engine/fire/fire1.png')).toBe('#ffb347');
    expect(glowColorForPath('/images/projectiles/missile.png')).toBe('#ff7a29');
    expect(glowColorForPath('/images/blocks/blockC.png')).toBeUndefined();
    expect(glowColorForPath('/images/me/stand1.png')).toBeUndefined();
  });
});
