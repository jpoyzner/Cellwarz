// A thrown ninja star is on fire: a flickering orange halo with flame tongues licking up from it, drawn additively
// on top of the sprite. The sparks it leaves behind come from ParticleSystem.spawnSparks. Purely cosmetic.

const HALO_RADIUS_PX = 20;
const TONGUE_COUNT = 3;
const TONGUE_LENGTH_PX = 18;
const FLICKER_HZ = 0.03;

export function isStarPath(path: string): boolean {
  return path.includes('/projectiles/star');
}

/** Draws the fire for a star whose sprite's top-left corner is at (x, y) on screen; `phase` desyncs neighbouring stars. */
export function drawStarFire(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  now: number,
  phase = 0,
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const t = now * FLICKER_HZ + phase;
  const flicker = 0.85 + 0.15 * Math.sin(t) + 0.08 * Math.sin(t * 2.7);
  const radius = HALO_RADIUS_PX * flicker;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const halo = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  halo.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
  halo.addColorStop(0.35, 'rgba(255, 150, 40, 0.6)');
  halo.addColorStop(1, 'rgba(255, 60, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

  for (let i = 0; i < TONGUE_COUNT; i++) {
    const sway = Math.sin(t * 1.3 + i * 2.1);
    const baseX = centerX + (i - (TONGUE_COUNT - 1) / 2) * (width * 0.35);
    const length = TONGUE_LENGTH_PX * (0.7 + 0.3 * Math.sin(t * 1.9 + i * 1.7)) * flicker;
    const flame = ctx.createLinearGradient(0, centerY, 0, centerY - length);
    flame.addColorStop(0, 'rgba(255, 210, 90, 0.9)');
    flame.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(baseX - width * 0.2, centerY);
    ctx.quadraticCurveTo(baseX + sway * 3, centerY - length * 0.6, baseX + sway * 5, centerY - length);
    ctx.quadraticCurveTo(baseX + sway * 3 + width * 0.1, centerY - length * 0.5, baseX + width * 0.2, centerY);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}
