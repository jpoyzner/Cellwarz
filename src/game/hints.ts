export type HintId = 'move' | 'grab' | 'carry';

export interface Hint {
  id: HintId;
  text: string;
}

/** What the renderer saw of the local avatar this moment; hints are purely a function of this plus the keys pressed. */
export interface HintContext {
  alive: boolean;
  touchingBlock: boolean;
  carryingBlock: boolean;
}

const STORAGE_KEY = 'cellwarz.hints.done';
const ARROW_LEFT = 37;
const ARROW_UP = 38;
const ARROW_RIGHT = 39;
const ARROW_DOWN = 40;
const SPACE = 32;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined; // storage can be blocked (private mode): hints then just show once per page load.
  }
}

/**
 * First-run, in-world control prompts. Each one is shown only until the player does what it asks, and is then never
 * shown again (remembered in localStorage). Only one shows at a time: carrying beats grabbing beats moving.
 */
export class HintSystem {
  /** Called whenever the hint to display changes (null = none). */
  onChange: ((hint: Hint | null) => void) | undefined;

  private readonly done: Set<HintId>;
  private ran = false;
  private jumped = false;
  private hint: Hint | null = null;

  /** `touch` words the prompts for the on-screen buttons instead of the keyboard. */
  constructor(
    private readonly storage: StorageLike | undefined = defaultStorage(),
    private readonly touch = false,
  ) {
    this.done = new Set(this.load());
  }

  get current(): Hint | null {
    return this.hint;
  }

  /** Feeds a key press/release of the local player. Only presses count as doing what a hint asks. */
  onKey(keyCode: number, down: boolean): void {
    if (!down) return;

    if (keyCode === ARROW_LEFT || keyCode === ARROW_RIGHT) this.ran = true;
    else if (keyCode === ARROW_UP) this.jumped = true;
    if (this.ran && this.jumped) this.finish('move');

    if (this.hint?.id === 'carry' && (keyCode === SPACE || keyCode === ARROW_DOWN)) this.finish('carry');
  }

  update(context: HintContext): void {
    // Grabbing is done once the block is actually overhead (a press with nothing to lift doesn't count).
    if (context.alive && context.carryingBlock) this.finish('grab');

    this.show(this.pick(context));
  }

  private pick(context: HintContext): Hint | null {
    if (!context.alive) return null;
    if (context.carryingBlock && !this.done.has('carry')) {
      return { id: 'carry', text: this.touch ? 'THROW \u00B7 \u25BC PUT DOWN' : 'SPACE: THROW \u00B7 \u2193: PUT DOWN' };
    }
    if (context.touchingBlock && !context.carryingBlock && !this.done.has('grab')) {
      return { id: 'grab', text: this.touch ? 'TAP GRAB TO LIFT THE BLOCK' : 'SPACE: GRAB THE BLOCK' };
    }
    if (!this.done.has('move')) return { id: 'move', text: this.moveText() };
    return null;
  }

  // Only what is still left to learn.
  private moveText(): string {
    if (this.touch) {
      if (!this.ran && !this.jumped) return '\u25C0 \u25B6 RUN \u00B7 JUMP';
      return this.ran ? 'TAP JUMP' : '\u25C0 \u25B6 RUN';
    }
    if (!this.ran && !this.jumped) return '\u2190 \u2192 RUN \u00B7 \u2191 JUMP';
    return this.ran ? '\u2191 JUMP' : '\u2190 \u2192 RUN';
  }

  private show(hint: Hint | null): void {
    if (hint?.id === this.hint?.id && hint?.text === this.hint?.text) return;
    this.hint = hint;
    this.onChange?.(hint);
  }

  private finish(id: HintId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.save();
    if (this.hint?.id === id) this.show(null);
  }

  private load(): HintId[] {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((id): id is HintId => id === 'move' || id === 'grab' || id === 'carry') : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.done]));
    } catch {
      // Ignore: a full or blocked store only means the hint may show again next visit.
    }
  }
}
