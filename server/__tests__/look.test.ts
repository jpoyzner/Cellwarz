import { describe, expect, it } from 'vitest';
import { isRobotRed, parseLook } from '../look';

describe('isRobotRed', () => {
  it('flags saturated reds, including near-reds either side of hue zero', () => {
    for (const red of ['#ff2040', '#ff0000', '#e02020', '#ff3b55', '#ff4400', '#ff0030']) {
      expect(isRobotRed(red), red).toBe(true);
    }
  });

  it('lets every other colour through: neons, pinks, oranges, greys and dark reds', () => {
    for (const fine of ['#00f6ff', '#ff2ea6', '#ff8ad8', '#ff9a2e', '#ffe83a', '#3cff7a', '#b45cff', '#ffffff', '#777777', '#000000', '#501607']) {
      expect(isRobotRed(fine), fine).toBe(false);
    }
  });
});

describe('parseLook', () => {
  it('accepts two valid colours and normalises them to lower case', () => {
    expect(parseLook('#00F6FF', '#FF2EA6')).toEqual({ headband: '#00f6ff', belt: '#ff2ea6' });
  });

  it('rejects the whole look when either part is missing, malformed or robot red', () => {
    expect(parseLook(undefined, undefined)).toBeUndefined();
    expect(parseLook('#00f6ff', undefined)).toBeUndefined();
    expect(parseLook('00f6ff', '#00f6ff')).toBeUndefined();
    expect(parseLook('#00f6f', '#00f6ff')).toBeUndefined();
    expect(parseLook('red', 'blue')).toBeUndefined();
    expect(parseLook({ headband: '#00f6ff' }, '#00f6ff')).toBeUndefined();
    expect(parseLook('#ff2040', '#00f6ff')).toBeUndefined();
    expect(parseLook('#00f6ff', '#ff0000')).toBeUndefined();
  });
});
