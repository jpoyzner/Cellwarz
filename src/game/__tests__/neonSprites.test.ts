import { describe, expect, it } from 'vitest';
import { BELT_MIN_Y, glowColorForPath, isHeadband, recolorActorParts, recolorHeadband, steelify } from '../neonSprites';

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
    expect(glowColorForPath('/images/mana/shield/shield.png')).toBe('#3cff7a');
    expect(glowColorForPath('/images/effects/diamond.png')).toBe('#3aa8ff');
    expect(glowColorForPath('/images/projectiles/missile.png')).toBe('#ff7a29');
    expect(glowColorForPath('/images/blocks/blockC.png')).toBeUndefined();
    expect(glowColorForPath('/images/me/stand1.png')).toBeUndefined();
  });

  it('colours the headband (top rows) and the belt (lower rows) independently', () => {
    const red = [220, 20, 20, 255];
    const rows = BELT_MIN_Y + 2;
    const data: number[] = [];
    for (let y = 0; y < rows; y++) data.push(...red);
    const art = pixels(data, 1, rows);

    recolorActorParts(art, [0, 255, 0], [255, 0, 255]);

    expect(Array.from(art.data.slice(0, 4))).toEqual([0, 255, 0, 255]);
    const lastRow = (rows - 1) * 4;
    expect(Array.from(art.data.slice(lastRow, lastRow + 4))).toEqual([255, 0, 255, 255]);
  });

  it('isolates one part as a glow layer, clearing the other part and everything that is not red', () => {
    const red = [220, 20, 20, 255];
    const black = [10, 10, 10, 255];
    const rows = BELT_MIN_Y + 1;
    const data: number[] = [];
    for (let y = 0; y < rows; y++) data.push(...(y === 3 || y === BELT_MIN_Y ? red : black));

    const headbandOnly = pixels(data.slice(), 1, rows);
    recolorActorParts(headbandOnly, [0, 255, 0], [255, 0, 255], 'headband');
    expect(Array.from(headbandOnly.data.slice(3 * 4, 3 * 4 + 4))).toEqual([0, 255, 0, 255]);
    expect(headbandOnly.data[BELT_MIN_Y * 4 + 3]).toBe(0);
    expect(headbandOnly.data[0 * 4 + 3]).toBe(0);

    const beltOnly = pixels(data.slice(), 1, rows);
    recolorActorParts(beltOnly, [0, 255, 0], [255, 0, 255], 'belt');
    expect(Array.from(beltOnly.data.slice(BELT_MIN_Y * 4, BELT_MIN_Y * 4 + 4))).toEqual([255, 0, 255, 255]);
    expect(beltOnly.data[3 * 4 + 3]).toBe(0);
  });
});
