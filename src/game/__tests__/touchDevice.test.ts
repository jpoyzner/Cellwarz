import { describe, expect, it } from 'vitest';
import { isTouchDevice } from '../touchDevice';

function fakeWindow(search: string, coarse: boolean, hardware?: { touchPoints: number; width: number; height: number }) {
  return {
    location: { search },
    matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' && coarse }),
    ...(hardware && { navigator: { maxTouchPoints: hardware.touchPoints }, screen: { width: hardware.width, height: hardware.height } }),
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

  it('still treats a phone-sized touch screen as touch when the browser claims a fine pointer ("desktop site" mode)', () => {
    expect(isTouchDevice(fakeWindow('', false, { touchPoints: 5, width: 390, height: 844 }))).toBe(true);
    expect(isTouchDevice(fakeWindow('', false, { touchPoints: 5, width: 844, height: 390 }))).toBe(true);
  });

  it('does not mistake a touchscreen laptop, or a desktop with no touch, for a phone', () => {
    expect(isTouchDevice(fakeWindow('', false, { touchPoints: 10, width: 1920, height: 1080 }))).toBe(false);
    expect(isTouchDevice(fakeWindow('', false, { touchPoints: 0, width: 390, height: 844 }))).toBe(false);
  });

  it('lets ?touch=0 override even a phone-sized touch screen', () => {
    expect(isTouchDevice(fakeWindow('?touch=0', false, { touchPoints: 5, width: 390, height: 844 }))).toBe(false);
  });
});
