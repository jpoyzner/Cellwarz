export interface Span {
  start: number;
  end: number;
}

/** Mirrors the server's `Vines` (see server/cell/cell.ts): where the roots start and where there is no wall or no room to hang. */
export interface VinesConfig {
  rootX: number;
  topY: number;
  faceY: number;
  minX: number;
  maxX: number;
  gaps: Span[];
  noHanging: Span[];
}

type Point = [number, number];

export interface HangingVine {
  x: number;
  length: number;
  width: number;
  phase: number;
  /** How far down the vine (0..1) each leaf sits; they alternate sides. */
  leaves: number[];
  /** A pink bud at the tip, echoing the flower. */
  bud: boolean;
}

const MIN_HANG_GAP_PX = 26;
const MAX_HANG_GAP_PX = 62;
const MIN_HANG_LENGTH_PX = 26;
const MAX_HANG_LENGTH_PX = 96;
// Keeps hanging vines off the very edge of an opening, where the wall they hang from is missing.
const GAP_MARGIN_PX = 8;

const SWAY_PERIOD_MS = 2600;
const ROOT_DARK = '#0b3d23';
const ROOT_LIGHT = '#27d46f';
// The dark green hue washed over the ceiling wall blocks (replacing the roots that used to be drawn there), fading out at both ends of the stretch.
const WALL_TINT_RGB = '10, 96, 48';
const WALL_TINT_ALPHA = 0.5;
const WALL_TINT_FADE_PX = 160;
const LEAF_COLOR = '#1fbf62';
const BUD_COLOR = '#ff4fd8';

/** A small deterministic generator, so every client grows the same vines from the same seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const overlaps = (spans: readonly Span[], from: number, to: number, margin = 0): boolean =>
  spans.some((span) => from < span.end + margin && to > span.start - margin);

/**
 * A dark green hue over the stretch of ceiling wall given (no roots drawn over the blocks, so they blend in), and
 * vines that hang from the wall's lower face with leaves and the odd bud. Drawn over the wall blocks.
 */
export class VineField {
  readonly hanging: HangingVine[] = [];
  /** The stretches of wall that get the green hue: the whole span minus the openings with no wall. */
  readonly tinted: Span[] = [];

  constructor(readonly config: VinesConfig) {
    const random = seededRandom(Math.round(config.rootX) ^ 0x51ed27);
    this.splitTint();
    this.growHangingVines(random);
  }

  private splitTint(): void {
    const { minX, maxX, gaps } = this.config;
    let start = minX;

    for (const gap of [...gaps].sort((a, b) => a.start - b.start)) {
      if (gap.end <= start || gap.start >= maxX) continue;
      if (gap.start > start) this.tinted.push({ start, end: gap.start });
      start = Math.max(start, gap.end);
    }

    if (start < maxX) this.tinted.push({ start, end: maxX });
  }

  private growHangingVines(random: () => number): void {
    const { minX, maxX, gaps, noHanging } = this.config;

    for (let x = minX + 10 + random() * MIN_HANG_GAP_PX; x < maxX - 10; x += MIN_HANG_GAP_PX + random() * (MAX_HANG_GAP_PX - MIN_HANG_GAP_PX)) {
      // Every random draw happens whether or not the vine is kept, so skipping one never shifts the others.
      const length = MIN_HANG_LENGTH_PX + random() * (MAX_HANG_LENGTH_PX - MIN_HANG_LENGTH_PX);
      const phase = random() * Math.PI * 2;
      const bud = random() < 0.35;
      const leafCount = Math.floor(length / 20);
      const leaves = Array.from({ length: leafCount }, (_, i) => (i + 1 + random() * 0.4) / (leafCount + 1));

      if (overlaps(gaps, x, x, GAP_MARGIN_PX) || overlaps(noHanging, x, x)) continue;
      this.hanging.push({ x, length, width: 2 + random() * 1.2, phase, leaves, bud });
    }
  }

  /** Whether any part of the field could be on screen (the ceiling is a single thin band, usually off screen). */
  isVisible(offsetX: number, offsetY: number, viewWidth: number, viewHeight: number): boolean {
    const bottom = this.config.faceY + MAX_HANG_LENGTH_PX + 12;
    return bottom - offsetY >= 0 && this.config.topY - offsetY <= viewHeight && this.config.maxX - offsetX >= -40 && this.config.minX - offsetX <= viewWidth + 40;
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, viewWidth: number, viewHeight: number, now: number): void {
    if (!this.isVisible(offsetX, offsetY, viewWidth, viewHeight)) return;

    const left = offsetX - 40;
    const right = offsetX + viewWidth + 40;

    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.drawTint(ctx, left, right);

    for (const vine of this.hanging) {
      if (vine.x < left || vine.x > right) continue;
      this.drawHangingVine(ctx, vine, now);
    }

    ctx.restore();
  }

  /** Washes the wall blocks green; the ends of the whole stretch fade out so the hue doesn't stop at a hard edge. */
  private drawTint(ctx: CanvasRenderingContext2D, left: number, right: number): void {
    const { minX, maxX, topY, faceY } = this.config;
    const fade = Math.min(WALL_TINT_FADE_PX, (maxX - minX) / 2);

    for (const { start, end } of this.tinted) {
      if (end < left || start > right) continue;
      const gradient = ctx.createLinearGradient(start, 0, end, 0);
      const stop = (x: number): number => (end > start ? Math.min(1, Math.max(0, (x - start) / (end - start))) : 0);
      const clear = `rgba(${WALL_TINT_RGB}, 0)`;
      const solid = `rgba(${WALL_TINT_RGB}, ${WALL_TINT_ALPHA})`;
      gradient.addColorStop(0, start <= minX ? clear : solid);
      if (start <= minX) gradient.addColorStop(stop(minX + fade), solid);
      if (end >= maxX) gradient.addColorStop(stop(maxX - fade), solid);
      gradient.addColorStop(1, end >= maxX ? clear : solid);
      ctx.fillStyle = gradient;
      ctx.fillRect(start, topY, end - start, faceY - topY);
    }
  }

  /** The vine's point at fraction `t` of its length, swung sideways by a sway that grows toward the free end. */
  private vinePoint(vine: HangingVine, t: number, now: number): Point {
    const sway = (3 + vine.length * 0.07) * t * Math.sin((now / SWAY_PERIOD_MS) * Math.PI * 2 + vine.phase + t * 2);
    return [vine.x + sway, this.config.faceY - 2 + t * vine.length];
  }

  private drawHangingVine(ctx: CanvasRenderingContext2D, vine: HangingVine, now: number): void {
    const segments = Math.max(3, Math.round(vine.length / 16));
    const points = Array.from({ length: segments + 1 }, (_, i) => this.vinePoint(vine, i / segments, now));

    for (const [color, width] of [[ROOT_DARK, vine.width + 2.5], [ROOT_LIGHT, vine.width * 0.45]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.stroke();
    }

    ctx.fillStyle = LEAF_COLOR;
    vine.leaves.forEach((t, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const [x, y] = this.vinePoint(vine, t, now);
      ctx.beginPath();
      ctx.ellipse(x + side * 4, y + 1, 5, 2.3, side * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });

    if (vine.bud) {
      const [x, y] = points[points.length - 1];
      ctx.fillStyle = 'rgba(255, 79, 216, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y + 1, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BUD_COLOR;
      ctx.beginPath();
      ctx.arc(x, y + 1, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
