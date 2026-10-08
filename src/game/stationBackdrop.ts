// Orbital-station backdrop, drawn between the starfield and the drifting debris: a city-lit planet limb and ship
// traffic. Purely cosmetic and screen-space — nothing here touches gameplay.

const PALETTE = ['#00f6ff', '#ff2ea6', '#ffb347', '#b6ff3c'];
const MAX_SHIFT_PX = 80;
const CITY_LIGHT_COUNT = 260;
const SHIP_COUNT = 7;
const SHIP_MARGIN_PX = 160;

export interface Ship {
  y: number;
  /** Pixels per millisecond; the sign is the direction of travel. */
  speed: number;
  phase: number;
  length: number;
  color: string;
}

interface CityLight {
  angle: number;
  radius: number;
  size: number;
  color: string;
  alpha: number;
}

/** Where a ship is horizontally at `now`; wraps around the screen plus a margin so ships glide on and off. */
export function shipX(ship: Ship, viewWidth: number, now: number): number {
  const span = viewWidth + SHIP_MARGIN_PX * 2;
  const raw = ship.phase * span + ship.speed * now;
  return (((raw % span) + span) % span) - SHIP_MARGIN_PX;
}

export class StationBackdrop {
  readonly ships: Ship[];
  private readonly cityLights: CityLight[];

  constructor(
    private readonly viewWidth: number,
    private readonly viewHeight: number,
    private readonly random: () => number = Math.random,
  ) {
    this.ships = Array.from({ length: SHIP_COUNT }, () => this.makeShip());
    this.cityLights = Array.from({ length: CITY_LIGHT_COUNT }, () => ({
      angle: Math.PI * (0.1 + this.random() * 0.8),
      radius: 0.8 + this.random() * 0.19,
      size: this.random() < 0.15 ? 2 : 1,
      color: PALETTE[Math.floor(this.random() * 3)],
      alpha: 0.4 + this.random() * 0.6,
    }));
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, now: number): void {
    this.drawPlanet(ctx, offsetX, offsetY);
    this.drawShips(ctx, now);
  }

  private makeShip(): Ship {
    const direction = this.random() < 0.5 ? -1 : 1;
    return {
      y: this.viewHeight * (0.12 + this.random() * 0.55),
      speed: direction * (0.03 + this.random() * 0.09),
      phase: this.random(),
      length: 30 + this.random() * 50,
      color: PALETTE[Math.floor(this.random() * PALETTE.length)],
    };
  }

  private drawPlanet(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number): void {
    const radius = Math.max(this.viewWidth, this.viewHeight) * 0.8;
    const cx = this.viewWidth * 0.7 - clamp(offsetX * 0.015, -MAX_SHIFT_PX, MAX_SHIFT_PX);
    // The camera keeps the avatar at screen center, so the limb's lowest point stays well above it.
    const cy = this.viewHeight * 0.2 - radius - clamp(offsetY * 0.01, -MAX_SHIFT_PX, MAX_SHIFT_PX);

    ctx.save();
    const body = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
    body.addColorStop(0, '#050816');
    body.addColorStop(1, '#0b1330');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Atmosphere rim: a cyan edge with a thinner magenta one just outside it.
    ctx.lineWidth = 3;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#00f6ff';
    ctx.strokeStyle = 'rgba(0, 246, 255, 0.55)';
    ctx.stroke();
    ctx.shadowColor = '#ff2ea6';
    ctx.strokeStyle = 'rgba(255, 46, 166, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // City lights on the night side near the limb.
    for (const light of this.cityLights) {
      const x = cx + Math.cos(light.angle) * radius * light.radius;
      const y = cy + Math.sin(light.angle) * radius * light.radius;
      if (x < 0 || x > this.viewWidth || y < 0 || y > this.viewHeight) continue;
      ctx.globalAlpha = light.alpha;
      ctx.fillStyle = light.color;
      ctx.fillRect(x, y, light.size, light.size);
    }
    ctx.restore();
  }

  private drawShips(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    for (const ship of this.ships) {
      const head = shipX(ship, this.viewWidth, now);
      const tailDirection = ship.speed > 0 ? -1 : 1;
      const tail = head + tailDirection * ship.length;
      const streak = ctx.createLinearGradient(tail, 0, head, 0);
      streak.addColorStop(0, withAlpha(ship.color, 0));
      streak.addColorStop(1, withAlpha(ship.color, 0.9));
      ctx.fillStyle = streak;
      ctx.fillRect(Math.min(head, tail), ship.y, ship.length, 2);
      ctx.shadowBlur = 8;
      ctx.shadowColor = ship.color;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(head - 1, ship.y - 0.5, 3, 3);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
