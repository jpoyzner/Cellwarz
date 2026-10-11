import type { Look } from './look';
import { NeonSprites } from './neonSprites';

export const DEMO_WIDTH = 130;
export const DEMO_HEIGHT = 100;
export const DEMO_LOOP_MS = 3600;

const FLOOR_Y = 94;
const AVATAR_X = 14;
const AVATAR_WIDTH = 48;
const AVATAR_HEIGHT = 64;
const BLOCK_SIZE = 24;
const STAND_FRAMES = 6;
const STAND_FRAME_MS = 150;

const GRAB_AT_MS = 900;
const THROW_AT_MS = 2100;
const THROW_FLIGHT_MS = 800;
const KEY_LIT_MS = 300;
const FADE_IN_MS = 200;
const FADE_OUT_MS = 300;
const THROW_DISTANCE = 66;
const THROW_ARC_HEIGHT = 30;

/** The pose reduced-motion users get instead of the loop: the block overhead, ready to throw. */
export const DEMO_STILL_MS = 1500;

export interface DemoFrame {
  standFrame: number;
  block: { x: number; y: number };
  blockAlpha: number;
  /** Whether the SPACE badge flashes: the loop presses it once to pick the block up and once to throw it. */
  spaceLit: boolean;
}

/** The 3.6s grab-and-throw loop as a pure function of time, so it can be tested without a canvas. */
export function demoFrame(timeMs: number): DemoFrame {
  const t = ((timeMs % DEMO_LOOP_MS) + DEMO_LOOP_MS) % DEMO_LOOP_MS;
  const restY = FLOOR_Y - BLOCK_SIZE;
  const headX = AVATAR_X + 8;
  const headY = FLOOR_Y - AVATAR_HEIGHT - BLOCK_SIZE;

  let block = { x: AVATAR_X + AVATAR_WIDTH, y: restY };
  if (t >= THROW_AT_MS + THROW_FLIGHT_MS) {
    block = { x: headX + THROW_DISTANCE, y: restY };
  } else if (t >= THROW_AT_MS) {
    const progress = (t - THROW_AT_MS) / THROW_FLIGHT_MS;
    block = {
      x: headX + THROW_DISTANCE * progress,
      y: headY + (restY - headY) * progress - THROW_ARC_HEIGHT * Math.sin(Math.PI * progress),
    };
  } else if (t >= GRAB_AT_MS) {
    block = { x: headX, y: headY };
  }

  const blockAlpha = Math.min(1, t / FADE_IN_MS, (DEMO_LOOP_MS - t) / FADE_OUT_MS);
  const spaceLit = (t >= GRAB_AT_MS && t < GRAB_AT_MS + KEY_LIT_MS) || (t >= THROW_AT_MS && t < THROW_AT_MS + KEY_LIT_MS);

  return { standFrame: Math.floor(t / STAND_FRAME_MS) % STAND_FRAMES, block, blockAlpha, spaceLit };
}

/** The login screen's little looping "this is how you pick up and throw a block" clip, drawn from the game's own art. */
export class ControlsDemo {
  private readonly neon = new NeonSprites();
  private readonly stand: HTMLImageElement[] = [];
  private readonly block = new Image();
  private look: Look | undefined;
  private handle = 0;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.width = DEMO_WIDTH;
    canvas.height = DEMO_HEIGHT;
    for (let i = 1; i <= STAND_FRAMES; i++) {
      const image = new Image();
      image.src = `/images/me/stand${i}.png`;
      this.stand.push(image);
    }
    this.block.src = '/images/mana/ice/ice.png';
  }

  /** The avatar wears the player's chosen colours, like the one walking around the room. */
  setLook(look: Look | null): void {
    this.look = look ?? undefined;
    this.neon.clear();
  }

  start(): void {
    const loop = (now: number) => {
      this.draw(this.reducedMotion ? DEMO_STILL_MS : now);
      this.handle = requestAnimationFrame(loop);
    };
    this.handle = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.handle);
  }

  private draw(now: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const frame = demoFrame(now);
    ctx.clearRect(0, 0, DEMO_WIDTH, DEMO_HEIGHT);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = 'rgba(0, 246, 255, 0.55)';
    ctx.fillRect(0, FLOOR_Y, DEMO_WIDTH, 1);

    const image = this.stand[frame.standFrame];
    const baked = this.neon.actor(frame.standFrame, image, 'local', this.look);
    const source: CanvasImageSource | undefined = baked?.source ?? (image.complete && image.naturalWidth > 0 ? image : undefined);
    if (source) {
      const pad = baked?.pad ?? 0;
      ctx.drawImage(source, AVATAR_X - pad, FLOOR_Y - AVATAR_HEIGHT - pad);
    }

    if (this.block.complete && this.block.naturalWidth > 0) {
      ctx.globalAlpha = frame.blockAlpha;
      ctx.drawImage(this.block, Math.round(frame.block.x), Math.round(frame.block.y));
      ctx.globalAlpha = 1;
    }

    ctx.font = 'bold 9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = frame.spaceLit ? '#ff2ea6' : 'rgba(143, 247, 255, 0.45)';
    ctx.fillText('[SPACE]', DEMO_WIDTH - 4, 12);
  }
}
