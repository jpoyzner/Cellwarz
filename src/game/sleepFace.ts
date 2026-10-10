// The art has white eyes in a black mask, all within the first rows of the head.
const HEAD_ROWS = 16;
const LIGHT_CHANNEL_MIN = 200;
/** Painted over the eyes of a sleeper (same as the mask), so they look shut. */
export const CLOSED_EYE_COLOR = '#050508';

/** Pixel offsets (x, y) of an avatar frame's eyes: the light pixels in its head. */
export function findEyePixels(data: Uint8ClampedArray, width: number, height: number): Array<[number, number]> {
  const eyes: Array<[number, number]> = [];
  for (let y = 0; y < Math.min(HEAD_ROWS, height); y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > 0 && data[i] > LIGHT_CHANNEL_MIN && data[i + 1] > LIGHT_CHANNEL_MIN && data[i + 2] > LIGHT_CHANNEL_MIN) {
        eyes.push([x, y]);
      }
    }
  }
  return eyes;
}

/** Finds (and remembers) each avatar frame's eyes, so a sleeper's can be painted shut. */
export class SleepFaces {
  private readonly eyes = new Map<HTMLImageElement, Array<[number, number]>>();

  drawClosedEyes(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number): void {
    if (!image.complete || image.width === 0) return; // not loaded yet: try again next frame.
    let pixels = this.eyes.get(image);
    if (!pixels) {
      const scratch = document.createElement('canvas');
      scratch.width = image.width;
      scratch.height = image.height;
      const scratchCtx = scratch.getContext('2d');
      if (!scratchCtx) return;
      scratchCtx.drawImage(image, 0, 0);
      pixels = findEyePixels(scratchCtx.getImageData(0, 0, image.width, image.height).data, image.width, image.height);
      this.eyes.set(image, pixels);
    }

    ctx.fillStyle = CLOSED_EYE_COLOR;
    for (const [eyeX, eyeY] of pixels) ctx.fillRect(x + eyeX, y + eyeY, 1, 1);
  }
}
