// Orbital-station backdrop, drawn between the starfield and the drifting debris: ship traffic. Purely cosmetic
// and screen-space — nothing here touches gameplay.

const PALETTE = ['#00f6ff', '#ff2ea6', '#ffb347', '#b6ff3c'];
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

/** Where a ship is horizontally at `now`; wraps around the screen plus a margin so ships glide on and off. */
export function shipX(ship: Ship, viewWidth: number, now: number): number {
  const span = viewWidth + SHIP_MARGIN_PX * 2;
  const raw = ship.phase * span + ship.speed * now;
  return (((raw % span) + span) % span) - SHIP_MARGIN_PX;
}

export class StationBackdrop {
  readonly ships: Ship[];

  constructor(
    private readonly viewWidth: number,
    private readonly viewHeight: number,
    private readonly random: () => number = Math.random,
  ) {
    this.ships = Array.from({ length: SHIP_COUNT }, () => this.makeShip());
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
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

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
