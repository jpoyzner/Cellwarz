// Holding Down (which also crouches the avatar) lets the player peek below: after a short delay the camera scrolls down,
// up to a quarter of the screen, and glides back once the key is released.
export const LOOK_DOWN_DELAY_MS = 250;
/** How far below the avatar the camera can go, as a fraction of the window height. */
export const LOOK_DOWN_MAX_SCREEN_FRACTION = 0.25;
const LOOK_DOWN_SPEED_PX_PER_S = 500;
const LOOK_DOWN_RETURN_SPEED_PX_PER_S = 1500;

export class LookDown {
  private held = false;
  private heldMs = 0;
  private offsetPx = 0;

  get offset(): number {
    return this.offsetPx;
  }

  setHeld(held: boolean): void {
    this.held = held;
    if (!held) this.heldMs = 0;
  }

  /** Advances the scroll by `dtMs` and returns how far below the avatar the camera now is (0 to `maxPx`). */
  update(dtMs: number, maxPx: number): number {
    if (this.held) {
      this.heldMs += dtMs;
      if (this.heldMs >= LOOK_DOWN_DELAY_MS) this.offsetPx = Math.min(maxPx, this.offsetPx + (LOOK_DOWN_SPEED_PX_PER_S * dtMs) / 1000);
    } else {
      this.offsetPx = Math.max(0, this.offsetPx - (LOOK_DOWN_RETURN_SPEED_PX_PER_S * dtMs) / 1000);
    }

    this.offsetPx = Math.min(this.offsetPx, maxPx);
    return this.offsetPx;
  }

  reset(): void {
    this.held = false;
    this.heldMs = 0;
    this.offsetPx = 0;
  }
}
