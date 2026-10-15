import { describe, expect, it } from 'vitest';
import { TouchKeyState } from '../touchKeys';

const LEFT = 37;
const RIGHT = 39;
const UP = 38;

function setup() {
  const sent: Array<[number, boolean]> = [];
  const state = new TouchKeyState((key, down) => sent.push([key, down]));
  let changes = 0;
  state.onChange = () => changes++;
  return { state, sent, changes: () => changes };
}

describe('TouchKeyState', () => {
  it('presses a key when a finger lands on it and releases it when the finger lifts', () => {
    const { state, sent } = setup();
    state.set(1, RIGHT);
    expect(sent).toEqual([[RIGHT, true]]);
    expect([...state.heldKeys()]).toEqual([RIGHT]);

    state.set(1, undefined);
    expect(sent).toEqual([[RIGHT, true], [RIGHT, false]]);
    expect(state.heldKeys().size).toBe(0);
  });

  it('sliding a finger from one key to another releases the first and presses the second', () => {
    const { state, sent } = setup();
    state.set(1, RIGHT);
    state.set(1, LEFT);
    expect(sent).toEqual([[RIGHT, true], [RIGHT, false], [LEFT, true]]);
  });

  it('ignores a finger re-reporting the key it already holds', () => {
    const { state, sent, changes } = setup();
    state.set(1, RIGHT);
    state.set(1, RIGHT);
    expect(sent).toEqual([[RIGHT, true]]);
    expect(changes()).toBe(1);
  });

  it('holds two different keys at once, one per finger', () => {
    const { state, sent } = setup();
    state.set(1, RIGHT);
    state.set(2, UP);
    expect(sent).toEqual([[RIGHT, true], [UP, true]]);
    expect(state.heldKeys()).toEqual(new Set([RIGHT, UP]));
  });

  it('keeps a key down until the last finger on it lets go', () => {
    const { state, sent } = setup();
    state.set(1, UP);
    state.set(2, UP);
    expect(sent).toEqual([[UP, true]]);

    state.set(1, undefined);
    expect(sent).toEqual([[UP, true]]);
    state.set(2, undefined);
    expect(sent).toEqual([[UP, true], [UP, false]]);
  });

  it('releaseAll lets go of every held key exactly once, and is a no-op when nothing is held', () => {
    const { state, sent, changes } = setup();
    state.releaseAll();
    expect(sent).toEqual([]);
    expect(changes()).toBe(0);

    state.set(1, RIGHT);
    state.set(2, UP);
    state.set(3, UP);
    sent.length = 0;
    state.releaseAll();
    expect(sent).toHaveLength(2);
    expect(sent).toContainEqual([RIGHT, false]);
    expect(sent).toContainEqual([UP, false]);
    expect(state.heldKeys().size).toBe(0);

    state.set(1, undefined);
    expect(sent).toHaveLength(2);
  });
});
