import { describe, expect, it } from 'vitest';
import { findEyePixels } from '../sleepFace';

function image(width: number, height: number, pixels: Array<[number, number, number[]]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, rgba] of pixels) data.set(rgba, (y * width + x) * 4);
  return data;
}

describe('findEyePixels', () => {
  it('finds the light pixels in the head, and ignores dark mask, transparent pixels and light ones lower down', () => {
    const data = image(10, 30, [
      [2, 3, [255, 255, 255, 255]], // an eye
      [3, 3, [255, 255, 255, 255]], // an eye
      [4, 3, [10, 10, 10, 255]], // mask
      [5, 3, [255, 255, 255, 0]], // transparent
      [2, 25, [255, 255, 255, 255]], // not in the head
    ]);

    expect(findEyePixels(data, 10, 30)).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });
});
