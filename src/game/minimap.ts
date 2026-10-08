import type { SpritesMap } from './types';

export type ImageKind = 'wall' | 'actor' | 'other';

export const MINIMAP_WIDTH = 220;
export const MINIMAP_HEIGHT = 140;

const PADDING = 6;
const WALL_SIZE_PX = 16;
const ACTOR_WIDTH_PX = 48;
const ACTOR_HEIGHT_PX = 64;

const WALL_COLOR = '#00c8e6';
const PLAYER_COLOR = '#ff2ea6';
const ROBOT_COLOR = '#ff3b55';
const SELF_COLOR = '#ffffff';
const SELF_OUTLINE_COLOR = '#b6ff3c';
const SWEEP_PERIOD_MS = 3500;
const SWEEP_WIDTH_PX = 36;

/** Walls and avatars/robots are only distinguishable by their image path (the wire format has no sprite type). */
export function classifyImagePaths(paths: string[]): ImageKind[] {
  return paths.map((path) => {
    if (path.includes('/blocks/')) return 'wall';
    if (path.includes('/me/')) return 'actor';
    return 'other';
  });
}

export interface MinimapFrame {
  sprites: SpritesMap;
  avatarSpriteIds: Set<string>;
  localSpriteId: string | undefined;
  positionOf: (spriteId: string) => { x: number; y: number };
  now: number;
}

interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Draws the room's walls (cached, redrawn only when they change) plus live avatar/robot dots onto its own canvas. */
export class Minimap {
  private kinds: ImageKind[] = [];
  private wallLayer: HTMLCanvasElement | undefined;
  private wallsDirty = true;
  private bounds: Bounds | undefined;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.width = MINIMAP_WIDTH;
    canvas.height = MINIMAP_HEIGHT;
  }

  setImagePaths(paths: string[]): void {
    this.kinds = classifyImagePaths(paths);
    this.wallsDirty = true;
  }

  kindOf(imageIndex: number): ImageKind {
    return this.kinds[imageIndex] ?? 'other';
  }

  invalidateWalls(): void {
    this.wallsDirty = true;
  }

  draw(frame: MinimapFrame): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    if (this.wallsDirty) this.rebuildWalls(frame.sprites);
    if (!this.bounds) return;

    if (this.wallLayer) ctx.drawImage(this.wallLayer, 0, 0);

    const robots: { x: number; y: number }[] = [];
    const players: { x: number; y: number }[] = [];
    let self: { x: number; y: number } | undefined;

    for (const [spriteId, sprite] of Object.entries(frame.sprites)) {
      if (this.kindOf(sprite[0]) !== 'actor') continue;

      const pos = frame.positionOf(spriteId);
      const point = this.project(pos.x + ACTOR_WIDTH_PX / 2, pos.y + ACTOR_HEIGHT_PX / 2);

      if (spriteId === frame.localSpriteId) self = point;
      else if (frame.avatarSpriteIds.has(spriteId)) players.push(point);
      else robots.push(point);
    }

    this.drawDots(ctx, robots, ROBOT_COLOR, 2);
    this.drawDots(ctx, players, PLAYER_COLOR, 2.5);

    if (self) {
      const pulse = 4 + Math.sin(frame.now / 200);
      ctx.beginPath();
      ctx.arc(self.x, self.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = SELF_COLOR;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = SELF_OUTLINE_COLOR;
      ctx.stroke();
    }

    this.drawSweep(ctx, frame.now);
  }

  /** A faint radar scan bar sweeping left to right across the room. */
  private drawSweep(ctx: CanvasRenderingContext2D, now: number): void {
    const x = ((now % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * (MINIMAP_WIDTH + SWEEP_WIDTH_PX) - SWEEP_WIDTH_PX;
    const bar = ctx.createLinearGradient(x, 0, x + SWEEP_WIDTH_PX, 0);
    bar.addColorStop(0, 'rgba(0, 246, 255, 0)');
    bar.addColorStop(1, 'rgba(0, 246, 255, 0.28)');
    ctx.fillStyle = bar;
    ctx.fillRect(x, 0, SWEEP_WIDTH_PX, MINIMAP_HEIGHT);
  }

  private project(worldX: number, worldY: number): { x: number; y: number } {
    const b = this.bounds!;
    const x = Math.min(Math.max(worldX - b.minX, 0), b.width) * this.scale + this.offsetX;
    const y = Math.min(Math.max(worldY - b.minY, 0), b.height) * this.scale + this.offsetY;
    return { x, y };
  }

  private drawDots(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, radius: number): void {
    ctx.fillStyle = color;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private rebuildWalls(sprites: SpritesMap): void {
    this.wallsDirty = false;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const walls: StoredPoint[] = [];

    for (const sprite of Object.values(sprites)) {
      if (this.kindOf(sprite[0]) !== 'wall') continue;
      walls.push([sprite[1], sprite[2]]);
      minX = Math.min(minX, sprite[1]);
      minY = Math.min(minY, sprite[2]);
      maxX = Math.max(maxX, sprite[1] + WALL_SIZE_PX);
      maxY = Math.max(maxY, sprite[2] + WALL_SIZE_PX);
    }

    if (walls.length === 0) {
      this.bounds = undefined;
      return;
    }

    this.bounds = { minX, minY, width: maxX - minX, height: maxY - minY };
    const availableWidth = MINIMAP_WIDTH - PADDING * 2;
    const availableHeight = MINIMAP_HEIGHT - PADDING * 2;
    this.scale = Math.min(availableWidth / this.bounds.width, availableHeight / this.bounds.height);
    this.offsetX = (MINIMAP_WIDTH - this.bounds.width * this.scale) / 2;
    this.offsetY = (MINIMAP_HEIGHT - this.bounds.height * this.scale) / 2;

    const layer = this.wallLayer ?? document.createElement('canvas');
    layer.width = MINIMAP_WIDTH;
    layer.height = MINIMAP_HEIGHT;
    this.wallLayer = layer;

    const ctx = layer.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = WALL_COLOR;
    const size = Math.max(1, WALL_SIZE_PX * this.scale);
    for (const [x, y] of walls) {
      const p = this.project(x, y);
      ctx.fillRect(p.x, p.y, size, size);
    }
  }
}

type StoredPoint = [number, number];
