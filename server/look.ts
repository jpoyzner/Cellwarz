/** A player's chosen avatar colours (`#rrggbb`). Mirrors src/game/look.ts, which the login room uses to build the picker. */
export interface Look {
  headband: string;
  belt: string;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Reds are what robots wear, so a player may not pick one (they would pass for a robot).
const ROBOT_HUE_DEGREES = 20;
const ROBOT_MIN_SATURATION = 0.5;
const ROBOT_MIN_VALUE = 0.35;

/** True for a saturated, bright red (or near-red) colour; `hex` is `#rrggbb`. */
export function isRobotRed(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return false;

  let hue: number;
  if (max === r) hue = (((g - b) / delta) % 6) * 60;
  else if (max === g) hue = ((b - r) / delta + 2) * 60;
  else hue = ((r - g) / delta + 4) * 60;
  if (hue < 0) hue += 360;

  const nearRed = hue <= ROBOT_HUE_DEGREES || hue >= 360 - ROBOT_HUE_DEGREES;
  return nearRed && delta / max >= ROBOT_MIN_SATURATION && max >= ROBOT_MIN_VALUE;
}

function parseColor(value: unknown): string | undefined {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) return undefined;
  const hex = value.toLowerCase();
  return isRobotRed(hex) ? undefined : hex;
}

/** Validates client-supplied colours; anything malformed or robot-red rejects the whole look (the default colours apply). */
export function parseLook(headband: unknown, belt: unknown): Look | undefined {
  const parsedHeadband = parseColor(headband);
  const parsedBelt = parseColor(belt);
  return parsedHeadband && parsedBelt ? { headband: parsedHeadband, belt: parsedBelt } : undefined;
}
