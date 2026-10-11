// Matches the server's grid math (server/cellData.ts ANIMATION_STEP=8, server/sprite/avatar.ts RUN_STEP_DISTANCE
// moved every Engine.HALF_STEP of 48 ticks/sec): 8px every 2/48s = 192px/s.
const RUN_SPEED_PX_PER_SEC = 192;

// A mismatch bigger than this (a wall, a push, a warp, a respawn) snaps instead of sliding into place — the
// client has no collision geometry to predict against, so big errors are trusted to the server immediately.
const RECONCILE_SNAP_THRESHOLD_PX = 24;
const SOFT_CORRECTION_TAU_MS = 120;
// While a direction is held the server's x advances every ~42ms; if it hasn't made new headway that way for this long the
// avatar is blocked (wall/obstacle), so stop predicting instead of walking into it and sliding back. Only new headway
// counts: standing on or pushing against a moving block makes the server's x wobble back and forth without getting anywhere.
const BLOCKED_AFTER_MS = 80;
// Smoothing of the speed the server is actually moving the avatar at (px/s), so riding a fast block predicts at that pace.
const SERVER_SPEED_TAU_MS = 100;

/**
 * Predicts the local avatar's horizontal position between server updates so movement starts the instant a
 * key is pressed instead of waiting a round-trip. Vertical (jump) motion is intentionally left server-driven
 * only — its curve/collision is too involved to approximate safely without duplicating server physics.
 */
export class LocalPredictor {
  private leftHeld = false;
  private rightHeld = false;
  // How far the drawn x leads (+) or trails (-) the server's x because of prediction; draws at serverX + lead. Kept as an offset
  // so that when nothing is being predicted (no key held, standing on a moving block) the avatar follows the server exactly
  // instead of lagging behind it by a smoothing stage (a lag that grows with speed and used to trip the snap threshold).
  private lead = 0;
  private started = false;
  private lastServerX: number | undefined;
  private furthestServerX: number | undefined;
  private serverSpeed = 0;
  private msSinceServerMoved = 0;

  setKey(keyCode: number, down: boolean): void {
    const directionBefore = this.direction();

    if (keyCode === 37) {
      this.leftHeld = down;
    } else if (keyCode === 39) {
      this.rightHeld = down;
    }

    // Key auto-repeat re-fires keydown; only a real change of direction earns a fresh grace period.
    if (this.direction() !== directionBefore) {
      this.msSinceServerMoved = 0;
      this.furthestServerX = this.lastServerX;
    }
  }

  reset(x: number): void {
    this.started = true;
    this.lead = 0;
    this.lastServerX = x;
    this.furthestServerX = x;
    this.serverSpeed = 0;
    this.msSinceServerMoved = 0;
  }

  /** Call once per rendered frame with the latest known authoritative x; returns the x to draw at. */
  getBlendedX(serverX: number, dtMs: number): number {
    if (!this.started) {
      this.reset(serverX);
      return serverX;
    }

    const direction = this.direction();
    const serverDelta = serverX - (this.lastServerX ?? serverX);
    this.serverSpeed += ((serverDelta / dtMs) * 1000 - this.serverSpeed) * (1 - Math.exp(-dtMs / SERVER_SPEED_TAU_MS));
    this.lastServerX = serverX;

    if (this.furthestServerX === undefined || serverX * direction > this.furthestServerX * direction) {
      this.furthestServerX = serverX;
      this.msSinceServerMoved = 0;
    } else {
      this.msSinceServerMoved += dtMs;
    }

    if (direction !== 0 && this.msSinceServerMoved <= BLOCKED_AFTER_MS) {
      const speed = Math.max(RUN_SPEED_PX_PER_SEC, this.serverSpeed * direction);
      this.lead += direction * ((speed * dtMs) / 1000) - serverDelta;
    }

    if (Math.abs(this.lead) > RECONCILE_SNAP_THRESHOLD_PX) {
      this.lead = 0;
    } else {
      this.lead *= Math.exp(-dtMs / SOFT_CORRECTION_TAU_MS);
    }

    return serverX + this.lead;
  }

  /** -1 left, 1 right, 0 for neither (or both) held. */
  private direction(): -1 | 0 | 1 {
    if (this.leftHeld === this.rightHeld) return 0;
    return this.leftHeld ? -1 : 1;
  }
}
