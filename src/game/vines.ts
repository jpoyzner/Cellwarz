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

export interface Root {
  points: Point[];
  width: number;
}

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

const ROOT_STEP_PX = 20;
// Where each root strand runs across the wall's height (0 = top edge, 1 = lower face); the first two always reach the ends.
const STRAND_LEVELS: ReadonlyArray<{ level: number; width: number; reachesEnd: boolean }> = [
  { level: 0.18, width: 3, reachesEnd: true },
  { level: 0.4, width: 4.5, reachesEnd: true },
  { level: 0.62, width: 3, reachesEnd: false },
  { level: 0.82, width: 2.2, reachesEnd: false },
];
// The knot of roots over the flower: this many concentric arcs (each this much wider than the last) and fanning roots.
const CROWN_RINGS = 5;
const CROWN_RING_SPACING_PX = 26;
const CROWN_ARC_STEPS = 16;
const CROWN_FAN_ROOTS = 8;
const MIN_HANG_GAP_PX = 26;
const MAX_HANG_GAP_PX = 62;
const MIN_HANG_LENGTH_PX = 26;
const MAX_HANG_LENGTH_PX = 96;
// Keeps hanging vines off the very edge of an opening, where the wall they hang from is missing.
const GAP_MARGIN_PX = 8;

const SWAY_PERIOD_MS = 2600;
const ROOT_DARK = '#0b3d23';
const ROOT_LIGHT = '#27d46f';
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

/** Cuts a polyline into pieces wherever a segment would run across a stretch with no wall. */
function splitAtGaps(points: Point[], gaps: readonly Span[]): Point[][] {
  const pieces: Point[][] = [];
  let current: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    if (i > 0 && overlaps(gaps, Math.min(points[i - 1][0], points[i][0]), Math.max(points[i - 1][0], points[i][0]))) {
      if (current.length > 1) pieces.push(current);
      current = [];
    }
    current.push(points[i]);
  }

  if (current.length > 1) pieces.push(current);
  return pieces;
}

/**
 * Cosmetic roots that grow from the flower's stem over the stretch of ceiling wall given (a thick knot right above the
 * flower, then strands out along the wall near its top edge, with side branches), and vines that hang from the wall's lower face with leaves and the odd bud. Drawn over the wall blocks.
 */
export class VineField {
  readonly roots: Root[] = [];
  readonly hanging: HangingVine[] = [];

  constructor(readonly config: VinesConfig) {
    const random = seededRandom(Math.round(config.rootX) ^ 0x51ed27);
    this.growRoots(random);
    this.growCrown(random);
    this.growHangingVines(random);
  }

  private wallY(level: number): number {
    return this.config.topY + (this.config.faceY - this.config.topY) * level;
  }

  private growRoots(random: () => number): void {
    const { rootX, minX, maxX, topY, faceY, gaps } = this.config;

    for (const direction of [-1, 1]) {
      const end = direction < 0 ? minX : maxX;
      const span = Math.abs(end - rootX);

      for (const strand of STRAND_LEVELS) {
        const reach = strand.reachesEnd ? span : span * (0.35 + random() * 0.6);
        const baseY = this.wallY(strand.level);
        const amplitude = 3 + random() * 5;
        const frequency = 0.012 + random() * 0.012;
        const phase = random() * Math.PI * 2;
        const points: Point[] = [[rootX, faceY]];

        // Leaves the stem, swinging up into the wall and out along the strand's own level.
        for (let distance = ROOT_STEP_PX / 2; distance <= reach + ROOT_STEP_PX; distance += ROOT_STEP_PX) {
          const settle = Math.min(1, distance / 90);
          const wobble = Math.sin(distance * frequency + phase) * amplitude;
          const y = Math.min(faceY - 1, Math.max(topY + 2, faceY + (baseY + wobble - faceY) * settle));
          points.push([Math.max(minX, Math.min(maxX, rootX + direction * Math.min(distance, reach))), y]);
        }

        for (const piece of splitAtGaps(points, gaps)) this.roots.push({ points: piece, width: strand.width });
        this.growBranches(points, direction, random);
      }
    }
  }

  /**
   * The thick knot of roots right above the flower: arcs that leave the wall's lower face on one side of the stem, climb
   * over it and come down the other side (wrapping the wall around the stem), plus roots fanning up and out from the
   * stem's foot, all staying inside the wall.
   */
  private growCrown(random: () => number): void {
    const { rootX, topY, faceY, minX, maxX, gaps } = this.config;
    const height = faceY - topY - 4;
    const clampX = (x: number): number => Math.max(minX, Math.min(maxX, x));
    const clampY = (y: number): number => Math.min(faceY - 1, Math.max(topY + 2, y));

    for (let ring = 1; ring <= CROWN_RINGS; ring++) {
      const radiusX = CROWN_RING_SPACING_PX * ring * (0.85 + random() * 0.3);
      const radiusY = Math.min(height, height * (0.3 + 0.7 * (ring / CROWN_RINGS)) * (0.9 + random() * 0.2));
      const wobble = 1.5 + random() * 2.5;
      const phase = random() * Math.PI * 2;
      const points: Point[] = [];

      for (let step = 0; step <= CROWN_ARC_STEPS; step++) {
        const angle = Math.PI - (step / CROWN_ARC_STEPS) * Math.PI;
        points.push([
          clampX(rootX + radiusX * Math.cos(angle)),
          clampY(faceY - radiusY * Math.sin(angle) + Math.sin(step * 1.7 + phase) * wobble),
        ]);
      }

      for (const piece of splitAtGaps(points, gaps)) this.roots.push({ points: piece, width: 4.2 - ring * 0.5 });
    }

    for (let root = 0; root < CROWN_FAN_ROOTS; root++) {
      const side = root % 2 === 0 ? -1 : 1;
      const spread = 10 + (Math.floor(root / 2) + random()) * (CROWN_RING_SPACING_PX * 0.9);
      const topAt = topY + 3 + random() * 14;
      const bow = (random() - 0.5) * 30;
      const points: Point[] = [];

      for (let step = 0; step <= 8; step++) {
        const t = step / 8;
        // Rises steeply out of the stem's foot, then bends outward along the top of the wall.
        points.push([clampX(rootX + side * spread * t * t + bow * Math.sin(t * Math.PI)), clampY(faceY + (topAt - faceY) * Math.sin((t * Math.PI) / 2))]);
      }

      for (const piece of splitAtGaps(points, gaps)) this.roots.push({ points: piece, width: 2.2 });
    }
  }

  /** Short side roots that dart up or down off a strand, staying inside the wall face. */
  private growBranches(strand: Point[], direction: number, random: () => number): void {
    const { topY, faceY, minX, maxX, gaps } = this.config;
    let nextAt = 3 + Math.floor(random() * 4);

    for (let i = nextAt; i < strand.length; i += nextAt) {
      nextAt = 3 + Math.floor(random() * 5);
      const [startX, startY] = strand[i];
      const rise = random() < 0.5 ? -1 : 1;
      const steps = 3 + Math.floor(random() * 3);
      const points: Point[] = [[startX, startY]];

      for (let step = 1; step <= steps; step++) {
        const [x, y] = points[step - 1];
        points.push([
          Math.max(minX, Math.min(maxX, x + direction * (6 + random() * 8))),
          Math.min(faceY - 1, Math.max(topY + 2, y + rise * (4 + random() * 7))),
        ]);
      }

      for (const piece of splitAtGaps(points, gaps)) this.roots.push({ points: piece, width: 1.4 });
    }
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

    for (const root of this.roots) {
      const first = root.points[0][0];
      const last = root.points[root.points.length - 1][0];
      if (Math.max(first, last) < left || Math.min(first, last) > right) continue;
      this.strokeRoot(ctx, root);
    }

    for (const vine of this.hanging) {
      if (vine.x < left || vine.x > right) continue;
      this.drawHangingVine(ctx, vine, now);
    }

    ctx.restore();
  }

  private strokeRoot(ctx: CanvasRenderingContext2D, root: Root): void {
    for (const [color, width] of [[ROOT_DARK, root.width + 2.5], [ROOT_LIGHT, Math.max(1, root.width * 0.4)]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(root.points[0][0], root.points[0][1]);
      for (let i = 1; i < root.points.length; i++) ctx.lineTo(root.points[i][0], root.points[i][1]);
      ctx.stroke();
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
