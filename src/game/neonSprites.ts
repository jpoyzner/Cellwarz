// Cyberpunk re-skins applied to sprite art at load time (no new art assets): dark steel wall tiles with neon
// trim, a glowing colored headband on every actor, and per-path neon glow colors for portals/pickups/projectiles.

export interface PixelBuffer {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

export type ActorTint = 'local' | 'player' | 'robot';

export const ACTOR_COLORS: Record<ActorTint, { rgb: readonly [number, number, number]; glow: string }> = {
  local: { rgb: [0, 246, 255], glow: '#00f6ff' },
  player: { rgb: [255, 46, 166], glow: '#ff2ea6' },
  robot: { rgb: [255, 48, 72], glow: '#ff2040' },
};

const GLOW_BLUR_PX = 6;
const NEON_CYAN = [0, 200, 230] as const;

/** The ninja art's headband is the only strongly red part of any actor frame. */
export function isHeadband(r: number, g: number, b: number, a: number): boolean {
  return a > 0 && r > 150 && g < 80 && b < 80;
}

/** Recolors headband pixels in place; with `onlyHeadband`, every other pixel is made transparent (the glow layer). */
export function recolorHeadband(pixels: PixelBuffer, rgb: readonly [number, number, number], onlyHeadband = false): void {
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    if (isHeadband(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
    } else if (onlyHeadband) {
      data[i + 3] = 0;
    }
  }
}

/** Turns a block tile into dark steel: luminance-preserving navy, a dim neon rim, and four corner rivets. */
export function steelify(pixels: PixelBuffer): void {
  const { data, width, height } = pixels;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;

      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
      let r = 14 + lum * 40;
      let g = 18 + lum * 46;
      let b = 38 + lum * 70;

      const rim = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const rivet = (x === 3 || x === width - 4) && (y === 3 || y === height - 4);
      if (rim) {
        r = r * 0.45 + NEON_CYAN[0] * 0.55;
        g = g * 0.45 + NEON_CYAN[1] * 0.55;
        b = b * 0.45 + NEON_CYAN[2] * 0.55;
      } else if (rivet) {
        r += 60;
        g += 70;
        b += 90;
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
}

/** Neon glow color for non-wall, non-actor sprites, picked from the image path (the wire format has no sprite type). */
export function glowColorForPath(path: string): string | undefined {
  if (path.includes('/doors/stargate/')) return '#00f6ff';
  if (path.includes('/doors/entrance/')) return '#ff2ea6';
  if (path.includes('/mana/engine/fire/')) return '#ffb347';
  if (path.includes('/mana/engine/')) return '#b6ff3c';
  if (path.includes('/mana/ice/')) return '#7fe7ff';
  if (path.includes('/mana/launcher/')) return '#ff5a3c';
  if (path.includes('/projectiles/')) return '#ff7a29';
  return undefined;
}

export interface BakedSprite {
  source: CanvasImageSource;
  /** Transparent margin added around the original art so the glow isn't clipped; draw at (x - pad, y - pad). */
  pad: number;
}

/** Lazily bakes and caches re-skinned copies of loaded sprite images; falls back to the original art on any failure. */
export class NeonSprites {
  private readonly cache = new Map<string, Map<number, BakedSprite | null>>();

  clear(): void {
    this.cache.clear();
  }

  wall(index: number, image: HTMLImageElement): BakedSprite | undefined {
    return this.bake('wall', index, image, () => this.bakeWall(image));
  }

  actor(index: number, image: HTMLImageElement, tint: ActorTint): BakedSprite | undefined {
    return this.bake(tint, index, image, () => this.bakeActor(image, tint));
  }

  // Called for every wall tile every frame, so lookups must not allocate.
  private bake(table: string, index: number, image: HTMLImageElement, build: () => BakedSprite | undefined): BakedSprite | undefined {
    let entries = this.cache.get(table);
    if (!entries) {
      entries = new Map();
      this.cache.set(table, entries);
    }

    const cached = entries.get(index);
    if (cached !== undefined) return cached ?? undefined;
    // Not decoded yet: leave the cache empty so a later frame retries.
    if (!image.complete || image.naturalWidth === 0) return undefined;

    let baked: BakedSprite | undefined;
    try {
      baked = build();
    } catch {
      baked = undefined;
    }
    entries.set(index, baked ?? null);
    return baked;
  }

  private readPixels(image: HTMLImageElement): { ctx: CanvasRenderingContext2D; pixels: ImageData } | undefined {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(image, 0, 0);
    return { ctx, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  }

  private bakeWall(image: HTMLImageElement): BakedSprite | undefined {
    const read = this.readPixels(image);
    if (!read) return undefined;

    steelify(read.pixels);
    read.ctx.putImageData(read.pixels, 0, 0);
    return { source: read.ctx.canvas, pad: 0 };
  }

  private bakeActor(image: HTMLImageElement, tint: ActorTint): BakedSprite | undefined {
    const body = this.readPixels(image);
    const glow = this.readPixels(image);
    if (!body || !glow) return undefined;

    const { rgb, glow: glowColor } = ACTOR_COLORS[tint];
    recolorHeadband(body.pixels, rgb);
    recolorHeadband(glow.pixels, rgb, true);
    body.ctx.putImageData(body.pixels, 0, 0);
    glow.ctx.putImageData(glow.pixels, 0, 0);

    const pad = GLOW_BLUR_PX + 2;
    const out = document.createElement('canvas');
    out.width = image.naturalWidth + pad * 2;
    out.height = image.naturalHeight + pad * 2;
    const ctx = out.getContext('2d');
    if (!ctx) return undefined;

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = GLOW_BLUR_PX;
    ctx.drawImage(glow.ctx.canvas, pad, pad);
    ctx.drawImage(glow.ctx.canvas, pad, pad);
    ctx.shadowBlur = 0;
    ctx.drawImage(body.ctx.canvas, pad, pad);
    return { source: out, pad };
  }
}
