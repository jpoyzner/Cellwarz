// Ported from the daat DJ Recognize site's starfield (kb/projects/dj-recognize-site/site/js/app.js), with
// the mouse pointer replaced by avatar bounding boxes as the thing that shatters drifting tetrominoes.
// Pieces/shards live in world coordinates (so you can run up to one); stars are a screen-space layer that
// slowly drifts in one shared random direction.

import type { StationBackdrop } from './stationBackdrop';

export interface TouchRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pieces this rect shatters fly their blocks to the score target (the local player's avatar). */
  collects?: boolean;
}

interface Star {
  x: number;
  y: number;
  r: number;
  twinkleSpeed: number;
  phase: number;
}

interface Shard {
  x: number;
  y: number;
  dx: number;
  dy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  lifeMs: number;
  ageMs: number;
  collect: boolean;
}

export interface Piece {
  x: number;
  y: number;
  dx: number;
  dy: number;
  rotation: number;
  rotationSpeed: number;
  cell: number;
  cx: number;
  cy: number;
  cells: ReadonlyArray<readonly [number, number]>;
  color: string;
  hoverRadius: number;
}

const TETROMINOES: Record<string, ReadonlyArray<readonly [number, number]>> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const SHAPE_NAMES = Object.keys(TETROMINOES);
const COLORS = ['#00f6ff', '#ff2ea6', '#7c3aed', '#b6ff3c', '#ffffff'];

// The original ran at a fixed 60fps; motion constants below are per-60fps-frame and scaled by real dt.
const FRAME_MS = 1000 / 60;
const SHARD_LIFE_MS = 1500;
// Collecting shards burst outward for a moment, then accelerate toward the score; the long life is only a backstop.
const COLLECT_SHARD_LIFE_MS = 8000;
const SCATTER_MS = 250;
const SEEK_BASE_SPEED = 6;
const SEEK_ACCEL_PER_MS = 0.03;
const SEEK_MAX_SPEED = 36;
const COLLECT_RADIUS_PX = 24;
const STAR_DRIFT_MIN_SPEED = 0.1;
const STAR_DRIFT_SPEED_RANGE = 0.1;
// One piece per this much world area (the website had ~one per 70000px² of screen).
const WORLD_AREA_PER_PIECE = 100000;
// A respawned piece must appear at least this far from every avatar so it can't instantly shatter again.
const RESPAWN_CLEARANCE_PX = 400;

/** Starfield plus drifting tetromino debris; pieces burst into their cells when an avatar touches them. */
export class SpaceBackground {
  pieces: Piece[] = [];
  shards: Shard[] = [];
  /** Optional layer (planet, ship traffic) drawn between the stars and the pieces. */
  backdrop: StationBackdrop | undefined;
  private stars: Star[] = [];
  private starDx = 0;
  private starDy = 0;

  constructor(
    private readonly worldWidth: number,
    private readonly worldHeight: number,
    private readonly viewWidth: number,
    private readonly viewHeight: number,
    private readonly random: () => number = Math.random,
  ) {
    this.populate();
  }

  /**
   * `touchers` are avatar rects in world coordinates; `scoreTarget` is where collecting shards fly (world
   * coordinates). Returns how many collecting shards reached the target this update.
   */
  update(dtMs: number, touchers: readonly TouchRect[], scoreTarget?: { x: number; y: number }): number {
    const step = dtMs / FRAME_MS;

    for (const star of this.stars) {
      star.x = this.wrap(star.x + this.starDx * step, this.viewWidth, 0);
      star.y = this.wrap(star.y + this.starDy * step, this.viewHeight, 0);
    }

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const piece = this.pieces[i];
      const hits = touchers.filter((rect) => distanceToRect(piece.x, piece.y, rect) < piece.hoverRadius);

      if (hits.length > 0) {
        // If the local avatar is among those touching it, the blocks are the local player's to collect.
        this.explodePiece(piece, hits.some((rect) => rect.collects));
        this.pieces.splice(i, 1);
        this.pieces.push(this.makePiece(this.pickRespawnPosition(touchers)));
        continue;
      }

      const margin = piece.cell * 5;
      piece.x = this.wrap(piece.x + piece.dx * step, this.worldWidth, margin);
      piece.y = this.wrap(piece.y + piece.dy * step, this.worldHeight, margin);
      piece.rotation += piece.rotationSpeed * step;
    }

    let collected = 0;

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const shard = this.shards[i];
      shard.lifeMs -= dtMs;
      shard.ageMs += dtMs;
      if (shard.lifeMs <= 0) {
        this.shards.splice(i, 1);
        continue;
      }

      if (shard.collect && scoreTarget && shard.ageMs >= SCATTER_MS) {
        const speed = Math.min(SEEK_MAX_SPEED, SEEK_BASE_SPEED + (shard.ageMs - SCATTER_MS) * SEEK_ACCEL_PER_MS);
        const toTargetX = scoreTarget.x - shard.x;
        const toTargetY = scoreTarget.y - shard.y;
        const distance = Math.hypot(toTargetX, toTargetY);

        if (distance <= COLLECT_RADIUS_PX + speed * step) {
          this.shards.splice(i, 1);
          collected++;
          continue;
        }

        const blend = 1 - Math.pow(0.8, step);
        shard.dx += ((toTargetX / distance) * speed - shard.dx) * blend;
        shard.dy += ((toTargetY / distance) * speed - shard.dy) * blend;
      }

      shard.x += shard.dx * step;
      shard.y += shard.dy * step;
      shard.rotation += shard.rotationSpeed * step;
    }

    return collected;
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, now: number): void {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    for (const star of this.stars) {
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(star.phase + now * star.twinkleSpeed));
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 230, 255, ${alpha})`;
      ctx.fill();
    }

    this.backdrop?.draw(ctx, offsetX, offsetY, now);

    for (const piece of this.pieces) {
      const reach = piece.cell * 5;
      const x = piece.x - offsetX;
      const y = piece.y - offsetY;
      if (x < -reach || x > this.viewWidth + reach || y < -reach || y > this.viewHeight + reach) continue;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(piece.rotation);
      ctx.shadowBlur = 8;
      ctx.shadowColor = piece.color;
      ctx.fillStyle = piece.color;
      ctx.globalAlpha = 0.75;
      for (const [cx, cy] of piece.cells) {
        ctx.fillRect(cx * piece.cell - piece.cx, cy * piece.cell - piece.cy, piece.cell - 1, piece.cell - 1);
      }
      ctx.restore();
    }

    for (const shard of this.shards) {
      if (!shard.collect) this.drawShard(ctx, shard, offsetX, offsetY);
    }
  }

  /** Drawn after the sprites so blocks flying to the score aren't hidden behind walls and avatars. */
  drawCollectingShards(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number): void {
    for (const shard of this.shards) {
      if (shard.collect) this.drawShard(ctx, shard, offsetX, offsetY);
    }
  }

  private drawShard(ctx: CanvasRenderingContext2D, shard: Shard, offsetX: number, offsetY: number): void {
    ctx.save();
    ctx.translate(shard.x - offsetX, shard.y - offsetY);
    ctx.rotate(shard.rotation);
    ctx.shadowBlur = 8;
    ctx.shadowColor = shard.color;
    ctx.fillStyle = shard.color;
    ctx.globalAlpha = 0.75 * Math.min(1, shard.lifeMs / (SHARD_LIFE_MS / 2));
    ctx.fillRect(-shard.size / 2, -shard.size / 2, shard.size - 1, shard.size - 1);
    ctx.restore();
  }

  private populate(): void {
    const count = Math.floor((this.viewWidth * this.viewHeight) / 3500);
    const driftAngle = this.random() * Math.PI * 2;
    const driftSpeed = STAR_DRIFT_MIN_SPEED + this.random() * STAR_DRIFT_SPEED_RANGE;
    this.starDx = Math.cos(driftAngle) * driftSpeed;
    this.starDy = Math.sin(driftAngle) * driftSpeed;
    this.stars = Array.from({ length: count }, () => ({
      x: this.random() * this.viewWidth,
      y: this.random() * this.viewHeight,
      r: this.random() * 1.4 + 0.2,
      twinkleSpeed: this.random() * 0.02 + 0.005,
      phase: this.random() * Math.PI * 2,
    }));

    const pieceCount = Math.max(10, Math.floor((this.worldWidth * this.worldHeight) / WORLD_AREA_PER_PIECE));
    this.pieces = Array.from({ length: pieceCount }, () =>
      this.makePiece({ x: this.random() * this.worldWidth, y: this.random() * this.worldHeight }),
    );
  }

  private pickRespawnPosition(touchers: readonly TouchRect[]): { x: number; y: number } {
    let position = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 20; attempt++) {
      position = { x: this.random() * this.worldWidth, y: this.random() * this.worldHeight };
      if (touchers.every((rect) => distanceToRect(position.x, position.y, rect) > RESPAWN_CLEARANCE_PX)) break;
    }
    return position;
  }

  private makePiece({ x, y }: { x: number; y: number }): Piece {
    // Bigger than the website's 5-10px cells so pieces read against the game's 16px blocks.
    const cell = this.random() * 8 + 8;
    const cells = TETROMINOES[SHAPE_NAMES[Math.floor(this.random() * SHAPE_NAMES.length)]];
    const cx = (Math.max(...cells.map((c) => c[0])) * cell) / 2;
    const cy = (Math.max(...cells.map((c) => c[1])) * cell) / 2;
    const speed = this.random() * 0.4 + 0.08;
    const angle = this.random() * Math.PI * 2;

    return {
      x,
      y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      rotation: this.random() * Math.PI * 2,
      rotationSpeed: (this.random() - 0.5) * 0.01,
      cell,
      cx,
      cy,
      cells,
      color: COLORS[Math.floor(this.random() * COLORS.length)],
      hoverRadius: cell * 2.5 + 12,
    };
  }

  private explodePiece(piece: Piece, collect: boolean): void {
    const cos = Math.cos(piece.rotation);
    const sin = Math.sin(piece.rotation);

    for (const [cx, cy] of piece.cells) {
      const localX = cx * piece.cell - piece.cx + piece.cell / 2;
      const localY = cy * piece.cell - piece.cy + piece.cell / 2;
      const worldX = piece.x + (localX * cos - localY * sin);
      const worldY = piece.y + (localX * sin + localY * cos);
      const away = Math.atan2(worldY - piece.y, worldX - piece.x) + (this.random() - 0.5) * 0.6;
      const speed = this.random() * 5 + 5;

      this.shards.push({
        x: worldX,
        y: worldY,
        dx: Math.cos(away) * speed,
        dy: Math.sin(away) * speed,
        rotation: piece.rotation,
        rotationSpeed: (this.random() - 0.5) * 0.5,
        size: piece.cell,
        color: piece.color,
        lifeMs: collect ? COLLECT_SHARD_LIFE_MS : SHARD_LIFE_MS,
        ageMs: 0,
        collect,
      });
    }
  }

  /** Wraps `value` into [-margin, size + margin] so pieces drift indefinitely. */
  private wrap(value: number, size: number, margin: number): number {
    const span = size + margin * 2;
    return ((((value + margin) % span) + span) % span) - margin;
  }
}

function distanceToRect(px: number, py: number, rect: TouchRect): number {
  const nearestX = Math.max(rect.x, Math.min(px, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(py, rect.y + rect.height));
  return Math.hypot(px - nearestX, py - nearestY);
}
