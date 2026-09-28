// Matches the server's grid math (server/cellData.ts ANIMATION_STEP=8, server/sprite/avatar.ts RUN_STEP_DISTANCE
// moved every Engine.HALF_STEP of 48 ticks/sec): 8px every 2/48s = 192px/s.
const RUN_SPEED_PX_PER_SEC = 192;

// A mismatch bigger than this (a wall, a push, a warp, a respawn) snaps instead of sliding into place — the
// client has no collision geometry to predict against, so big errors are trusted to the server immediately.
const RECONCILE_SNAP_THRESHOLD_PX = 24;
const SOFT_CORRECTION_TAU_MS = 120;

/**
 * Predicts the local avatar's horizontal position between server updates so movement starts the instant a
 * key is pressed instead of waiting a round-trip. Vertical (jump) motion is intentionally left server-driven
 * only — its curve/collision is too involved to approximate safely without duplicating server physics.
 */
export class LocalPredictor {
  private leftHeld = false;
  private rightHeld = false;
  private predictedX: number | undefined;

  setKey(keyCode: number, down: boolean): void {
    if (keyCode === 37) {
      this.leftHeld = down;
    } else if (keyCode === 39) {
      this.rightHeld = down;
    }
  }

  reset(x: number): void {
    this.predictedX = x;
  }

  /** Call once per rendered frame with the latest known authoritative x; returns the x to draw at. */
  getBlendedX(serverX: number, dtMs: number): number {
    if (this.predictedX === undefined) {
      this.predictedX = serverX;
      return this.predictedX;
    }

    if (this.leftHeld && !this.rightHeld) {
      this.predictedX -= (RUN_SPEED_PX_PER_SEC * dtMs) / 1000;
    } else if (this.rightHeld && !this.leftHeld) {
      this.predictedX += (RUN_SPEED_PX_PER_SEC * dtMs) / 1000;
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
}
