import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PART_COLOR, hexToRgb, isAllowedColor, isRobotRed, LOOK_PALETTE, loadSavedLogin, resolveLook, saveLogin } from '../look';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  return store;
}

describe('look colours', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#00f6ff')).toEqual([0, 246, 255]);
  });

  it('keeps robot red out of the palette and rejects it (and junk) as a custom colour', () => {
    expect(LOOK_PALETTE.some((color) => isRobotRed(color))).toBe(false);
    expect(isAllowedColor('#ff2040')).toBe(false);
    expect(isAllowedColor('#ff0000')).toBe(false);
    expect(isAllowedColor('cyan')).toBe(false);
    expect(isAllowedColor('#3cff7a')).toBe(true);
  });

  it('resolves the picker state: nothing picked is the default look, one part picked fills the other with cyan', () => {
    expect(resolveLook(null, null)).toBeNull();
    expect(resolveLook('#3cff7a', null)).toEqual({ headband: '#3cff7a', belt: DEFAULT_PART_COLOR });
    expect(resolveLook(null, '#ff2ea6')).toEqual({ headband: DEFAULT_PART_COLOR, belt: '#ff2ea6' });
  });
});

describe('saved login', () => {
  it('round-trips the name and colours', () => {
    stubStorage();
    saveLogin({ name: 'neo', headband: '#3cff7a', belt: null });
    expect(loadSavedLogin()).toEqual({ name: 'neo', headband: '#3cff7a', belt: null });
  });

  it('starts blank when nothing is stored and ignores corrupt or red stored values', () => {
    stubStorage();
    expect(loadSavedLogin()).toEqual({ name: '', headband: null, belt: null });

    stubStorage({ 'cellwarz.login': '{not json' });
    expect(loadSavedLogin()).toEqual({ name: '', headband: null, belt: null });

    stubStorage({ 'cellwarz.login': JSON.stringify({ name: 'x', headband: '#ff2040', belt: 5 }) });
    expect(loadSavedLogin()).toEqual({ name: 'x', headband: null, belt: null });
  });
});
