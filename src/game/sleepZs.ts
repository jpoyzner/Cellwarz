interface FloatingZ {
  x: number;
  y: number;
  ageMs: number;
  phase: number;
  color: string;
}

// Mirrors server/jsonGenerator.ts: extra-info key a sleeping avatar's sprite entry carries.
export const SLEEPING_KEY = '3';

const SPAWN_INTERVAL_MS = 750;
const LIFE_MS = 2200;
const RISE_PX_PER_S = 24;
const SWAY_PX = 7;
const MIN_FONT_PX = 10;
const MAX_FONT_PX = 22;
const MAX_ZS = 60;
const Z_COLORS = ['#7df9ff', '#ffffff', '#ff7bf2'];
/** How far a sleeper leans forward (radians) around its feet, plus a slow breathing sway on top of it. */
const LEAN_RADIANS = 0.12;
const BREATH_RADIANS = 0.025;
const BREATH_PERIOD_MS = 2600;

/** Bright "Z"s drifting up and fading from the heads of sleeping avatars — purely cosmetic, drawn in world pixels. */
export class SleepZs {
  private zs: FloatingZ[] = [];
  private spawned = 0;
  private readonly sinceSpawnMs = new Map<string, number>();

  /** `sleepers` maps a sprite id to the world position of the top-centre of its head. */
  update(dtMs: number, sleepers: Map<string, { x: number; y: number }>): void {
    for (const [spriteId, head] of sleepers) {
      const elapsed = (this.sinceSpawnMs.get(spriteId) ?? SPAWN_INTERVAL_MS) + dtMs;
      if (elapsed >= SPAWN_INTERVAL_MS) {
        this.sinceSpawnMs.set(spriteId, 0);
        if (this.zs.length < MAX_ZS) {
          const color = Z_COLORS[this.spawned++ % Z_COLORS.length];
          this.zs.push({ x: head.x, y: head.y, ageMs: 0, phase: Math.random() * Math.PI * 2, color });
        }
      } else {
        this.sinceSpawnMs.set(spriteId, elapsed);
      }
    }

    for (const spriteId of this.sinceSpawnMs.keys()) {
      if (!sleepers.has(spriteId)) this.sinceSpawnMs.delete(spriteId);
    }

    for (const z of this.zs) z.ageMs += dtMs;
    this.zs = this.zs.filter((z) => z.ageMs < LIFE_MS);
  }

  /** Number of Zs currently floating (public so tests can check them). */
  get count(): number {
    return this.zs.length;
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number): void {
    if (this.zs.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (const z of this.zs) {
      const progress = z.ageMs / LIFE_MS;
      const alpha = progress < 0.15 ? progress / 0.15 : 1 - (progress - 0.15) / 0.85;
      const size = MIN_FONT_PX + (MAX_FONT_PX - MIN_FONT_PX) * progress;
      const x = z.x + Math.sin(z.phase + progress * 5) * SWAY_PX * progress - offsetX;
      const y = z.y - (z.ageMs / 1000) * RISE_PX_PER_S - offsetY;
      const color = z.color;

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `bold ${size.toFixed(1)}px Arial`;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText('Z', x, y);
      ctx.fillStyle = color;
      ctx.fillText('Z', x, y);
    }

    ctx.restore();
  }
}

/** The tilt of a sleeping avatar: a forward slump (towards where it faces) with a slow breathing sway. */
export function sleepLean(facingLeft: boolean, nowMs: number): number {
  const breath = Math.sin((nowMs / BREATH_PERIOD_MS) * Math.PI * 2) * BREATH_RADIANS;
  return (facingLeft ? -1 : 1) * LEAN_RADIANS + breath;
}
