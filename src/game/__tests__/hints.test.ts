import { describe, expect, it } from 'vitest';
import { HintSystem } from '../hints';
import type { Hint } from '../hints';

const LEFT = 37;
const UP = 38;
const RIGHT = 39;
const DOWN = 40;
const SPACE = 32;

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem = (key: string) => this.items.get(key) ?? null;
  setItem = (key: string, value: string) => void this.items.set(key, value);
}

const idle = { alive: true, touchingBlock: false, carryingBlock: false };

function setup(storage = new MemoryStorage()) {
  const hints = new HintSystem(storage);
  const shown: Array<Hint | null> = [];
  hints.onChange = (hint) => shown.push(hint);
  return { hints, shown, storage };
}

describe('HintSystem', () => {
  it('opens with the movement prompt, and trims it to what is left to learn', () => {
    const { hints } = setup();
    hints.update(idle);
    expect(hints.current).toMatchObject({ id: 'move', text: expect.stringContaining('RUN') });
    expect(hints.current?.text).toContain('JUMP');

    hints.onKey(RIGHT, true);
    hints.update(idle);
    expect(hints.current?.text).toBe('\u2191 JUMP');
  });

  it('fades the movement prompt out once the player has both run and jumped, and never brings it back', () => {
    const { hints, shown, storage } = setup();
    hints.update(idle);
    hints.onKey(LEFT, true);
    hints.onKey(UP, true);
    expect(hints.current).toBeNull();
    expect(shown.at(-1)).toBeNull();

    hints.update(idle);
    expect(hints.current).toBeNull();
    expect(setup(storage).hints.current).toBeNull(); // remembered: a later visit starts without it
    const next = setup(storage).hints;
    next.update(idle);
    expect(next.current).toBeNull();
  });

  it('ignores key releases', () => {
    const { hints } = setup();
    hints.update(idle);
    hints.onKey(LEFT, false);
    hints.onKey(UP, false);
    hints.update(idle);
    expect(hints.current?.id).toBe('move');
  });

  it('prompts to grab a block that is being touched, until a block is actually lifted', () => {
    const { hints } = setup();
    hints.update({ ...idle, touchingBlock: true });
    expect(hints.current).toEqual({ id: 'grab', text: 'SPACE: GRAB THE BLOCK' });

    hints.onKey(SPACE, true); // a press that lifts nothing doesn't finish it
    expect(hints.current?.id).toBe('grab');

    hints.update({ ...idle, carryingBlock: true });
    expect(hints.current?.id).toBe('carry');
  });

  it('prompts to throw while carrying, and finishes on Space (throw) or Down (put down)', () => {
    for (const key of [SPACE, DOWN]) {
      const { hints } = setup();
      hints.update({ ...idle, touchingBlock: true, carryingBlock: true });
      expect(hints.current?.id).toBe('carry');

      hints.onKey(key, true);
      expect(hints.current).toBeNull();
      hints.update({ ...idle, carryingBlock: true });
      expect(hints.current?.id).toBe('move'); // back to whatever is left

      hints.update({ ...idle, touchingBlock: true, carryingBlock: true });
      expect(hints.current?.id).toBe('move');
    }
  });

  it('shows no prompt for a dead or spectating player', () => {
    const { hints } = setup();
    hints.update(idle);
    hints.update({ alive: false, touchingBlock: true, carryingBlock: true });
    expect(hints.current).toBeNull();
  });

  it('only reports changes', () => {
    const { hints, shown } = setup();
    hints.update(idle);
    hints.update(idle);
    hints.update(idle);
    expect(shown).toHaveLength(1);
  });

  it('survives unreadable or missing storage', () => {
    const broken = { getItem: () => '{nope', setItem: () => { throw new Error('full'); } };
    const hints = new HintSystem(broken);
    hints.update(idle);
    hints.onKey(LEFT, true);
    hints.onKey(UP, true);
    expect(hints.current).toBeNull();

    const none = new HintSystem(undefined);
    none.update(idle);
    expect(none.current?.id).toBe('move');
  });

  it('words the prompts for the on-screen buttons on a touch device', () => {
    const hints = new HintSystem(new MemoryStorage(), true);
    hints.update(idle);
    expect(hints.current?.text).toBe('\u25C0 \u25B6 RUN \u00B7 JUMP');

    hints.update({ alive: true, touchingBlock: true, carryingBlock: false });
    expect(hints.current).toMatchObject({ id: 'grab', text: expect.stringContaining('GRAB') });
    expect(hints.current?.text).not.toContain('SPACE');

    hints.update({ alive: true, touchingBlock: false, carryingBlock: true });
    expect(hints.current).toMatchObject({ id: 'carry', text: expect.stringContaining('THROW') });
    expect(hints.current?.text).not.toContain('SPACE');
  });

  it('still trims the touch movement prompt as each half is learned', () => {
    const hints = new HintSystem(new MemoryStorage(), true);
    hints.update(idle);
    hints.onKey(RIGHT, true);
    hints.update(idle);
    expect(hints.current?.text).toBe('TAP JUMP');
  });
});
