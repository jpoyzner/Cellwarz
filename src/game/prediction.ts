// Matches the server's grid math (server/cellData.ts ANIMATION_STEP=8, server/sprite/avatar.ts RUN_STEP_DISTANCE
// moved every Engine.HALF_STEP of 48 ticks/sec): 8px every 2/48s = 192px/s.
const RUN_SPEED_PX_PER_SEC = 192;

// A mismatch bigger than this (a wall, a push, a warp, a respawn) snaps instead of sliding into place — the
// client has no collision geometry to predict against, so big errors are trusted to the server immediately.
const RECONCILE_SNAP_THRESHOLD_PX = 24;
const SOFT_CORRECTION_TAU_MS = 120;
// While a direction is held the server's x advances every ~42ms; if it hasn't moved for this long the avatar is
// blocked (wall/obstacle), so stop predicting instead of walking into it and sliding back.
const BLOCKED_AFTER_MS = 80;

/**
 * Predicts the local avatar's horizontal position between server updates so movement starts the instant a
 * key is pressed instead of waiting a round-trip. Vertical (jump) motion is intentionally left server-driven
 * only — its curve/collision is too involved to approximate safely without duplicating server physics.
 */
export class LocalPredictor {
  private leftHeld = false;
  private rightHeld = false;
  private predictedX: number | undefined;
  private lastServerX: number | undefined;
  private msSinceServerMoved = 0;

  setKey(keyCode: number, down: boolean): void {
    const directionBefore = this.direction();

    if (keyCode === 37) {
      this.leftHeld = down;
    } else if (keyCode === 39) {
      this.rightHeld = down;
    }

    // Key auto-repeat re-fires keydown; only a real change of direction earns a fresh grace period.
    if (this.direction() !== directionBefore) this.msSinceServerMoved = 0;
  }

  reset(x: number): void {
    this.predictedX = x;
    this.lastServerX = x;
    this.msSinceServerMoved = 0;
  }

  /** Call once per rendered frame with the latest known authoritative x; returns the x to draw at. */
  getBlendedX(serverX: number, dtMs: number): number {
    if (this.predictedX === undefined) {
      this.predictedX = serverX;
      this.lastServerX = serverX;
      return this.predictedX;
    }

    if (serverX !== this.lastServerX) {
      this.lastServerX = serverX;
      this.msSinceServerMoved = 0;
    } else {
      this.msSinceServerMoved += dtMs;
    }

    if (this.msSinceServerMoved <= BLOCKED_AFTER_MS) {
      this.predictedX += this.direction() * ((RUN_SPEED_PX_PER_SEC * dtMs) / 1000);
    }

    const error = serverX - this.predictedX;
    if (Math.abs(error) > RECONCILE_SNAP_THRESHOLD_PX) {
      this.predictedX = serverX;
    } else {
      const pull = 1 - Math.exp(-dtMs / SOFT_CORRECTION_TAU_MS);
      this.predictedX += error * pull;
    }

    return this.predictedX;
  }

  /** -1 left, 1 right, 0 for neither (or both) held. */
  private direction(): -1 | 0 | 1 {
    if (this.leftHeld === this.rightHeld) return 0;
    return this.leftHeld ? -1 : 1;
  }
}
