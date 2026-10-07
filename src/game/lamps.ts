export interface Lamp {
  x: number;
  topY: number;
  bottomY: number;
  halfWidth: number;
  minX: number;
  maxX: number;
}

// Each beam's floor end sweeps this far either side of straight down; alternate lamps swing in opposite
// directions so neighbouring beams overlap briefly at the peak of the sway.
const SWAY_AMPLITUDE_PX = 220;
const SWAY_PERIOD_MS = 7000;

export function drawLamps(
  ctx: CanvasRenderingContext2D,
  lamps: readonly Lamp[],
  offsetX: number,
  offsetY: number,
  viewWidth: number,
  viewHeight: number,
  now: number,
): void {
  lamps.forEach((lamp, index) => {
    const x = lamp.x - offsetX;
    const topY = lamp.topY - offsetY;
    const bottomY = lamp.bottomY - offsetY;
    const reach = lamp.halfWidth + SWAY_AMPLITUDE_PX;
    if (x + reach < 0 || x - reach > viewWidth || bottomY < 0 || topY > viewHeight) return;

    const sway = SWAY_AMPLITUDE_PX * Math.sin((now / SWAY_PERIOD_MS) * Math.PI * 2 + index * Math.PI);
    const baseX = x + sway;

    ctx.save();
    ctx.beginPath();
    ctx.rect(lamp.minX - offsetX, 0, lamp.maxX - lamp.minX, viewHeight);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(0, topY, 0, bottomY);
    // Bright enough to act as a backdrop the black ninjas read against; still fades toward the floor.
    beam.addColorStop(0, 'rgba(255, 240, 180, 0.95)');
    beam.addColorStop(1, 'rgba(255, 236, 160, 0.5)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.lineTo(baseX - lamp.halfWidth, bottomY);
    ctx.lineTo(baseX + lamp.halfWidth, bottomY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The fixture hangs from the ceiling and tilts to point along the beam.
    ctx.save();
    ctx.translate(x, topY - 40);
    ctx.rotate(Math.atan2(sway, bottomY - topY));
    ctx.translate(-x, -(topY - 40));
    ctx.fillStyle = '#3a3d4d';
    ctx.fillRect(x - 3, topY - 40, 6, 40);
    ctx.beginPath();
    ctx.moveTo(x - 18, topY + 8);
    ctx.lineTo(x - 6, topY - 4);
    ctx.lineTo(x + 6, topY - 4);
    ctx.lineTo(x + 18, topY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = '#fff3b0';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff8d6';
    ctx.beginPath();
    ctx.arc(x, topY + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}
