type SendKey = (key: number, down: boolean) => void;

/**
 * Turns several simultaneous fingers into the same key presses the keyboard sends. Each finger (pointer id) holds at most
 * one key; a key goes down when the first finger takes it and up when the last one lets go, so two thumbs can never
 * leave a key stuck or release it early.
 */
export class TouchKeyState {
  /** Called whenever the set of held keys changes, so the buttons can light up. */
  onChange: (() => void) | undefined;

  private readonly byPointer = new Map<number, number>();

  constructor(private readonly sendKey: SendKey) {}

  heldKeys(): Set<number> {
    return new Set(this.byPointer.values());
  }

  /** The finger now holds `key` (or nothing, if undefined), releasing whatever it held before. */
  set(pointerId: number, key: number | undefined): void {
    const previous = this.byPointer.get(pointerId);
    if (previous === key) return;

    if (key === undefined) this.byPointer.delete(pointerId);
    else this.byPointer.set(pointerId, key);

    if (previous !== undefined && !this.isHeld(previous)) this.sendKey(previous, false);
    if (key !== undefined && !this.isHeldByAnother(key, pointerId)) this.sendKey(key, true);
    this.onChange?.();
  }

  /** Lets go of everything (the page was hidden, the controls went away, ...). */
  releaseAll(): void {
    const held = this.heldKeys();
    if (held.size === 0) return;
    this.byPointer.clear();
    for (const key of held) this.sendKey(key, false);
    this.onChange?.();
  }

  private isHeld(key: number): boolean {
    for (const held of this.byPointer.values()) if (held === key) return true;
    return false;
  }

  private isHeldByAnother(key: number, pointerId: number): boolean {
    for (const [id, held] of this.byPointer) if (id !== pointerId && held === key) return true;
    return false;
  }
}
