// Whole-frame post effects on the game canvas: a cheap bloom (blurred bright-pass added back over the frame) and a
// short RGB-glitch burst used on warp/death. Cosmetic only.

const BLOOM_DOWNSCALE = 6;
const BLOOM_ALPHA = 0.35;
const GLITCH_STRIPS = 7;

export class PostFx {
  private bloomCanvas: HTMLCanvasElement | undefined;
  private scratch: HTMLCanvasElement | undefined;
  private glitchStart = 0;
  private glitchDurationMs = 0;

  triggerGlitch(now: number, durationMs: number): void {
    this.glitchStart = now;
    this.glitchDurationMs = durationMs;
  }

  isGlitching(now: number): boolean {
    return now < this.glitchStart + this.glitchDurationMs;
  }

  apply(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, now: number): void {
    if (this.isGlitching(now)) {
      this.drawGlitch(ctx, canvas, (this.glitchStart + this.glitchDurationMs - now) / this.glitchDurationMs);
    }
    this.drawBloom(ctx, canvas);
  }

  private drawBloom(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const width = Math.max(1, Math.floor(canvas.width / BLOOM_DOWNSCALE));
    const height = Math.max(1, Math.floor(canvas.height / BLOOM_DOWNSCALE));

    if (!this.bloomCanvas) this.bloomCanvas = document.createElement('canvas');
    const bloom = this.bloomCanvas;
    if (bloom.width !== width || bloom.height !== height) {
      bloom.width = width;
      bloom.height = height;
    }

    const bloomCtx = bloom.getContext('2d');
    if (!bloomCtx) return;

    bloomCtx.clearRect(0, 0, width, height);
    bloomCtx.imageSmoothingQuality = 'medium';
    // Bright-pass: crush darks so only the neon/lit parts bleed into the glow.
    bloomCtx.filter = 'contrast(1.8) brightness(0.8)';
    bloomCtx.drawImage(canvas, 0, 0, width, height);
    bloomCtx.filter = 'none';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = BLOOM_ALPHA;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bloom, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  private drawGlitch(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, intensity: number): void {
    if (!this.scratch) this.scratch = document.createElement('canvas');
    const scratch = this.scratch;
    if (scratch.width !== canvas.width || scratch.height !== canvas.height) {
      scratch.width = canvas.width;
      scratch.height = canvas.height;
    }

    const scratchCtx = scratch.getContext('2d');
    if (!scratchCtx) return;
    scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
    scratchCtx.drawImage(canvas, 0, 0);

    for (let i = 0; i < GLITCH_STRIPS; i++) {
      const y = Math.random() * canvas.height;
      const h = 6 + Math.random() * 34;
      const dx = (Math.random() * 2 - 1) * 50 * intensity;
      ctx.drawImage(scratch, 0, y, canvas.width, h, dx, y, canvas.width, h);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(0, 246, 255, ${0.14 * intensity})` : `rgba(255, 46, 166, ${0.14 * intensity})`;
      ctx.fillRect(Math.max(0, dx), y, canvas.width, h);
      ctx.restore();
    }
  }
}
