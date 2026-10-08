// A gas giant with rings that flies through the level's background. The server owns where it is (and pulls sprites
// toward it, see server/planet.ts); this only draws it, extrapolates its motion between server updates, and works
// out how hard it pulls the purely-cosmetic background tetrominoes.

import type { PlanetState } from './types';

/** Mirrors server/planet.ts: sprites (and tetrominoes) within this many avatar heights of the surface are pulled. */
export const PLANET_PULL_AVATAR_HEIGHTS = 6;
const AVATAR_HEIGHT_PX = 64;
export const PLANET_PULL_RANGE_PX = PLANET_PULL_AVATAR_HEIGHTS * AVATAR_HEIGHT_PX;

// Mirrors server/planet.ts: anything whose centre gets this close to the planet's centre (a fraction of its radius)
// is swallowed — it shrinks away over CONSUME_MS and is then gone.
export const PLANET_CORE_FRACTION = 0.15;
export const PLANET_CONSUME_MS = 1000;

const RING_INNER_RADII = 1.3;
const RING_OUTER_RADII = 1.95;
// Rings (the widest thing drawn) reach this many radii from the centre.
// Dimmed so the planet reads as distant scenery behind the lamps' glare rather than competing with the sprites.
const RING_OPACITY = 0.7;
const DRAW_REACH_RADII = RING_OUTER_RADII;

interface Band {
  top: number;
  height: number;
  color: string;
  alpha: number;
}

interface RingBand {
  middle: number;
  width: number;
  alpha: number;
}

interface Look {
  base: string;
  glow: string;
  ring: string;
  tilt: number;
  ringFlatness: number;
  bands: Band[];
  ringBands: RingBand[];
  storm: { x: number; y: number; width: number; height: number; color: string };
}

const PALETTES = [
  { base: '#c98f55', accents: ['#f2d3a0', '#8a5a34', '#e8b27a', '#6e4527'], storm: '#b5452f', glow: '#ffb36b', ring: '#e8d2a8' },
  { base: '#4fa9c4', accents: ['#9be3de', '#2f7d99', '#c8f2ee', '#1f5f7a'], storm: '#e8fbff', glow: '#6fe8ff', ring: '#bff4ff' },
  { base: '#8a5be0', accents: ['#e0c2ff', '#5a34a8', '#b891f5', '#41237f'], storm: '#ff7ad9', glow: '#c48cff', ring: '#e9d6ff' },
  { base: '#d9654a', accents: ['#ffd1a1', '#a8382b', '#f5a07a', '#7a2519'], storm: '#fff0c8', glow: '#ff8f6b', ring: '#ffd9b0' },
  { base: '#d2c06a', accents: ['#f2e6a8', '#a8963f', '#e6d68a', '#7a6c28'], storm: '#c2562f', glow: '#ffe27a', ring: '#f5ecc0' },
];

/** How strongly a planet pulls a point, as 0..1: 0 beyond the range, rising quadratically toward the surface. */
export function pullFalloff(distanceToCenter: number, radius: number, range = PLANET_PULL_RANGE_PX): number {
  const fromSurface = Math.max(0, distanceToCenter - radius);
  if (fromSurface >= range) return 0;
  return (1 - fromSurface / range) ** 2;
}

export class PlanetView {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  private look: Look;

  constructor(state: PlanetState) {
    this.id = state.id;
    this.x = state.x;
    this.y = state.y;
    this.vx = state.vx;
    this.vy = state.vy;
    this.radius = state.radius;
    this.look = makeLook(state.seed);
  }

  /** Takes a server update: a new planet gets a new look, the same one just has its position corrected. */
  sync(state: PlanetState): void {
    if (state.id !== this.id) {
      this.look = makeLook(state.seed);
      this.id = state.id;
    }
    this.x = state.x;
    this.y = state.y;
    this.vx = state.vx;
    this.vy = state.vy;
    this.radius = state.radius;
  }

  advance(dtMs: number): void {
    this.x += (this.vx * dtMs) / 1000;
    this.y += (this.vy * dtMs) / 1000;
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, viewWidth: number, viewHeight: number): void {
    const x = this.x - offsetX;
    const y = this.y - offsetY;
    const reach = this.radius * DRAW_REACH_RADII;
    if (x < -reach || x > viewWidth + reach || y < -reach || y > viewHeight + reach) return;

    const { look, radius } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(look.tilt);

    const halo = ctx.createRadialGradient(0, 0, radius * 0.9, 0, 0, radius * 1.3);
    halo.addColorStop(0, withAlpha(look.glow, 0.35));
    halo.addColorStop(1, withAlpha(look.glow, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.fill();

    this.drawRing(ctx, Math.PI, Math.PI * 2);
    this.drawBody(ctx);
    this.drawRing(ctx, 0, Math.PI);

    ctx.restore();
  }

  private drawBody(ctx: CanvasRenderingContext2D): void {
    const { look, radius } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = look.base;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

    for (const band of look.bands) {
      ctx.globalAlpha = band.alpha;
      ctx.fillStyle = band.color;
      ctx.fillRect(-radius, band.top * radius, radius * 2, band.height * radius);
    }

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = look.storm.color;
    ctx.beginPath();
    ctx.ellipse(look.storm.x * radius, look.storm.y * radius, look.storm.width * radius, look.storm.height * radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Lit from the upper left, falling into darkness at the far limb.
    const shade = ctx.createRadialGradient(-radius * 0.4, -radius * 0.4, radius * 0.15, -radius * 0.1, -radius * 0.1, radius * 1.25);
    shade.addColorStop(0, 'rgba(0, 0, 10, 0.2)');
    shade.addColorStop(0.55, 'rgba(0, 0, 10, 0.4)');
    shade.addColorStop(1, 'rgba(0, 0, 10, 0.85)');
    ctx.fillStyle = shade;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

    ctx.restore();
  }

  /** One half of the ring plane (squashed vertically for perspective); the far half is drawn behind the body. */
  private drawRing(ctx: CanvasRenderingContext2D, startAngle: number, endAngle: number): void {
    const { look, radius } = this;
    ctx.save();
    ctx.scale(1, look.ringFlatness);
    ctx.strokeStyle = look.ring;
    for (const band of look.ringBands) {
      ctx.globalAlpha = band.alpha * RING_OPACITY;
      ctx.lineWidth = band.width * radius;
      ctx.beginPath();
      ctx.arc(0, 0, band.middle * radius, startAngle, endAngle);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function makeLook(seed: number): Look {
  const random = mulberry32(seed);
  const palette = PALETTES[Math.floor(random() * PALETTES.length)];

  const bands: Band[] = [];
  let top = -1;
  while (top < 1) {
    const height = 0.06 + random() * 0.18;
    bands.push({
      top,
      height: Math.min(height, 1 - top),
      color: palette.accents[Math.floor(random() * palette.accents.length)],
      alpha: 0.35 + random() * 0.45,
    });
    top += height + random() * 0.12;
  }

  const ringBands: RingBand[] = [];
  const ringCount = 10;
  const span = RING_OUTER_RADII - RING_INNER_RADII;
  const gapAt = 3 + Math.floor(random() * 4);
  for (let i = 0; i < ringCount; i++) {
    if (i === gapAt) continue;
    ringBands.push({
      middle: RING_INNER_RADII + ((i + 0.5) / ringCount) * span,
      width: (span / ringCount) * 1.05,
      alpha: 0.25 + random() * 0.5,
    });
  }

  return {
    base: palette.base,
    glow: palette.glow,
    ring: palette.ring,
    tilt: (random() - 0.5) * 0.9,
    ringFlatness: 0.22 + random() * 0.14,
    bands,
    ringBands,
    storm: { x: (random() - 0.5) * 0.8, y: (random() - 0.5) * 0.9, width: 0.1 + random() * 0.08, height: 0.05 + random() * 0.04, color: palette.storm },
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
