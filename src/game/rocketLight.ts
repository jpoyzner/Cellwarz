// Rockets are tiny and dark against unlit space, so they get a bright flickering exhaust flame behind them and a
// hot light on the tip. Purely cosmetic, drawn additively on top of the sprite.

const FLAME_LENGTH_PX = 22;
const TIP_LIGHT_RADIUS_PX = 11;
const FLAME_FLICKER_HZ = 0.05;

export function isRocketPath(path: string): boolean {
  return path.includes('/projectiles/missile');
}

/** Mirrored art is the one flying left (`missileL.png`). */
export function rocketFacesLeft(path: string): boolean {
  return /L\.png$/.test(path);
}

/** Draws the exhaust and tip light for a rocket whose sprite's top-left corner is at (x, y) on screen. */
export function drawRocketLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  facingLeft: boolean,
  now: number,
): void {
  const direction = facingLeft ? -1 : 1;
  const centerY = y + height / 2;
  const tipX = facingLeft ? x : x + width;
  const tailX = facingLeft ? x + width : x;
  const flicker = 0.8 + 0.2 * Math.sin(now * FLAME_FLICKER_HZ) + 0.1 * Math.sin(now * FLAME_FLICKER_HZ * 2.7);
  const flameLength = FLAME_LENGTH_PX * flicker;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const flame = ctx.createLinearGradient(tailX, 0, tailX - direction * flameLength, 0);
  flame.addColorStop(0, 'rgba(255, 255, 230, 1)');
  flame.addColorStop(0.3, 'rgba(255, 190, 70, 0.9)');
  flame.addColorStop(1, 'rgba(255, 60, 0, 0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(tailX, centerY - height * 0.4);
  ctx.lineTo(tailX - direction * flameLength, centerY);
  ctx.lineTo(tailX, centerY + height * 0.4);
  ctx.closePath();
  ctx.fill();

  const flameGlow = ctx.createRadialGradient(tailX, centerY, 0, tailX, centerY, TIP_LIGHT_RADIUS_PX);
  flameGlow.addColorStop(0, 'rgba(255, 170, 60, 0.7)');
  flameGlow.addColorStop(1, 'rgba(255, 90, 0, 0)');
  ctx.fillStyle = flameGlow;
  ctx.fillRect(tailX - TIP_LIGHT_RADIUS_PX, centerY - TIP_LIGHT_RADIUS_PX, TIP_LIGHT_RADIUS_PX * 2, TIP_LIGHT_RADIUS_PX * 2);

  const tipRadius = TIP_LIGHT_RADIUS_PX * (0.9 + 0.1 * flicker);
  const tip = ctx.createRadialGradient(tipX, centerY, 0, tipX, centerY, tipRadius);
  tip.addColorStop(0, 'rgba(255, 255, 255, 1)');
  tip.addColorStop(0.35, 'rgba(255, 230, 150, 0.8)');
  tip.addColorStop(1, 'rgba(255, 140, 40, 0)');
  ctx.fillStyle = tip;
  ctx.fillRect(tipX - tipRadius, centerY - tipRadius, tipRadius * 2, tipRadius * 2);

  ctx.restore();
}
