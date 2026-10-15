import { describe, expect, it } from 'vitest';
import { isTouchDevice } from '../touchDevice';

function fakeWindow(search: string, coarse: boolean) {
  return {
    location: { search },
    matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' && coarse }),
  } as unknown as Window;
}

describe('isTouchDevice', () => {
  it('is true when the main pointer is coarse (a finger), false for a mouse', () => {
    expect(isTouchDevice(fakeWindow('', true))).toBe(true);
    expect(isTouchDevice(fakeWindow('', false))).toBe(false);
  });

  it('can be forced either way with ?touch=1 / ?touch=0', () => {
    expect(isTouchDevice(fakeWindow('?touch=1', false))).toBe(true);
    expect(isTouchDevice(fakeWindow('?touch=0', true))).toBe(false);
    expect(isTouchDevice(fakeWindow('?touch=maybe', true))).toBe(true);
  });
});
