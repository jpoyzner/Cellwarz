// The look of a transporter pad, shared by the login room's pads and the in-game stargates (which are the same
// transporters: stand on one and press Up).

export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export interface PadShape {
  /** Horizontal centre and floor line the pad plate sits on, in the context's pixels. */
  centerX: number;
  floorY: number;
  halfWidth: number;
  /** How far the cone of light and its motes rise above the plate. */
  coneHeight: number;
  color: string;
}

/** The pad's plate: a dark slab with a glowing top edge (dim when `active` is false). */
export function drawPadPlate(ctx: CanvasRenderingContext2D, pad: PadShape, active: boolean, scale = 1): void {
  const { centerX, floorY, halfWidth, color } = pad;
  ctx.fillStyle = '#141c36';
  ctx.fillRect(centerX - halfWidth, floorY - 6 * scale, halfWidth * 2, 8 * scale);
  ctx.fillStyle = active ? color : '#2a3350';
  ctx.fillRect(centerX - halfWidth, floorY - 6 * scale, halfWidth * 2, 2 * scale);
}

/** The glow of an active pad: a soft cone of light, motes drifting up it and a pulsing ring on the plate. */
export function drawPadGlow(ctx: CanvasRenderingContext2D, pad: PadShape, clockSeconds: number, scale = 1): void {
  const { centerX, floorY, halfWidth, coneHeight, color } = pad;
  const top = floorY - coneHeight;
  const plateTop = floorY - 6 * scale;

  const cone = ctx.createLinearGradient(0, floorY, 0, top);
  cone.addColorStop(0, hexAlpha(color, 0.38));
  cone.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(centerX - halfWidth + 6 * scale, plateTop);
  ctx.lineTo(centerX + halfWidth - 6 * scale, plateTop);
  ctx.lineTo(centerX + halfWidth - 26 * scale, top);
  ctx.lineTo(centerX - halfWidth + 26 * scale, top);
  ctx.fill();

  for (let i = 0; i < 7; i++) {
    const phase = (clockSeconds * 0.5 + i / 7) % 1;
    const moteX = centerX + Math.sin(i * 12.9 + clockSeconds) * (halfWidth - 24 * scale);
    ctx.fillStyle = hexAlpha(color, 0.8 * (1 - phase));
    ctx.fillRect(moteX, floorY - 10 * scale - phase * coneHeight * 0.8, 2 * scale, 2 * scale);
  }

  const ring = 0.5 + 0.5 * Math.sin(clockSeconds * 3);
  ctx.strokeStyle = hexAlpha(color, 0.35 + 0.4 * ring);
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.ellipse(centerX, plateTop, Math.max(halfWidth - 8 * scale, 0), 7 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
}

/** The white column a beaming avatar rides up; `progress` runs 0 → 1 over the beam. */
export function drawBeamColumn(
  ctx: CanvasRenderingContext2D,
  x: number,
  bottomY: number,
  height: number,
  halfWidth: number,
  color: string,
  progress: number,
): void {
  const strength = Math.sin(Math.min(progress * 1.3, 1) * Math.PI);
  const half = halfWidth * (1 - progress * 0.4);
  const beam = ctx.createLinearGradient(x - half, 0, x + half, 0);
  beam.addColorStop(0, hexAlpha(color, 0));
  beam.addColorStop(0.5, hexAlpha('#ffffff', 0.9 * strength));
  beam.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = beam;
  ctx.fillRect(x - half, bottomY - height, half * 2, height);
}
