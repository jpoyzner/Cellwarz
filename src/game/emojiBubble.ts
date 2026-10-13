// Mirrors server/jsonGenerator.ts: extra-info key an avatar's sprite entry carries while its emoji bubble is up.
export const EMOJI_KEY = '5';

const BUBBLE_SIZE_PX = 30;
const TAIL_PX = 6;
const CORNER_PX = 8;
const EMOJI_FONT_PX = 20;
/** Gap between the top of the head and the tip of the bubble's tail. */
const HEAD_GAP_PX = 12;
const EMOJI_FONT = `${EMOJI_FONT_PX}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

/** How far above the top of the head a bubble reaches, so name tags can sit above it. */
export const BUBBLE_TOTAL_HEIGHT_PX = BUBBLE_SIZE_PX + TAIL_PX + HEAD_GAP_PX;

/** A neon-rimmed speech bubble with its tail pointing down at the head: `centerX` is the head's centre, `headY` its top. */
export function drawEmojiBubble(ctx: CanvasRenderingContext2D, emoji: string, centerX: number, headY: number): void {
  const tipY = headY - HEAD_GAP_PX;
  const bottom = tipY - TAIL_PX;
  const top = bottom - BUBBLE_SIZE_PX;
  const left = centerX - BUBBLE_SIZE_PX / 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, top, BUBBLE_SIZE_PX, BUBBLE_SIZE_PX, CORNER_PX);
  ctx.moveTo(centerX - TAIL_PX, bottom - 1);
  ctx.lineTo(centerX, tipY);
  ctx.lineTo(centerX + TAIL_PX, bottom - 1);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8, 12, 28, 0.88)';
  ctx.strokeStyle = '#7df9ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#7df9ff';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.font = EMOJI_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(emoji, centerX, top + BUBBLE_SIZE_PX / 2 + 1);
  ctx.restore();
}
