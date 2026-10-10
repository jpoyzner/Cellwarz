// Cosmetic: a diamond the local player just collected pops out, then accelerates to the diamonds HUD. The server
// already owns the count; the HUD only catches up when each of these arrives.

const FRAME_MS = 1000 / 60;
const SCATTER_MS = 200;
const SEEK_BASE_SPEED = 7;
const SEEK_ACCEL_PER_MS = 0.04;
const SEEK_MAX_SPEED = 40;
const ARRIVE_RADIUS_PX = 20;
const LIFE_MS = 4000;
const SIZE_PX = 14;
const COLOR = '#3aa8ff';

interface FlyingDiamond {
  x: number;
  y: number;
  dx: number;
  dy: number;
  ageMs: number;
  rotation: number;
}

export class DiamondFlight {
  flying: FlyingDiamond[] = [];

  spawn(x: number, y: number): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 2;
    this.flying.push({ x, y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed - 1.5, ageMs: 0, rotation: 0 });
  }

  /** `target` is in world coordinates (the HUD's screen position plus the camera offset). Returns how many arrived. */
  update(dtMs: number, target: { x: number; y: number } | undefined): number {
    const step = dtMs / FRAME_MS;
    let arrived = 0;

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const diamond = this.flying[i];
      diamond.ageMs += dtMs;

      if (diamond.ageMs >= LIFE_MS) {
        this.flying.splice(i, 1);
        arrived++; // backstop: never leave the HUD short of what the server counted
        continue;
      }

      if (target && diamond.ageMs >= SCATTER_MS) {
        const speed = Math.min(SEEK_MAX_SPEED, SEEK_BASE_SPEED + (diamond.ageMs - SCATTER_MS) * SEEK_ACCEL_PER_MS);
        const toX = target.x - diamond.x;
        const toY = target.y - diamond.y;
        const distance = Math.hypot(toX, toY) || 1;

        if (distance <= ARRIVE_RADIUS_PX + speed * step) {
          this.flying.splice(i, 1);
          arrived++;
          continue;
        }

        const blend = Math.min(1, 0.25 * step);
        diamond.dx += ((toX / distance) * speed - diamond.dx) * blend;
        diamond.dy += ((toY / distance) * speed - diamond.dy) * blend;
      }

      diamond.x += diamond.dx * step;
      diamond.y += diamond.dy * step;
      diamond.rotation += 0.2 * step;
    }

    return arrived;
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number): void {
    for (const diamond of this.flying) {
      ctx.save();
      ctx.translate(diamond.x - offsetX, diamond.y - offsetY);
      ctx.rotate(diamond.rotation);
      ctx.shadowBlur = 12;
      ctx.shadowColor = COLOR;
      ctx.fillStyle = COLOR;
      ctx.fillRect(-SIZE_PX / 2, -SIZE_PX / 2, SIZE_PX, SIZE_PX);
      ctx.restore();
    }
  }
}
