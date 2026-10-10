/** A player's chosen avatar colours (`#rrggbb`); mirrors server/look.ts, which validates them again on the server. */
export interface Look {
  headband: string;
  belt: string;
}

/** A colour for a part the player left on "default" once the other part has been customised (the local-avatar cyan). */
export const DEFAULT_PART_COLOR = '#00f6ff';

// Reds are what robots wear (see server/look.ts), so the picker rejects them.
const ROBOT_HUE_DEGREES = 20;
const ROBOT_MIN_SATURATION = 0.5;
const ROBOT_MIN_VALUE = 0.35;

export const LOOK_PALETTE: readonly string[] = [
  '#00f6ff',
  '#3a8bff',
  '#b45cff',
  '#ff2ea6',
  '#ff8ad8',
  '#ff9a2e',
  '#ffe83a',
  '#b6ff3c',
  '#3cff7a',
  '#ffffff',
];

export function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** True for a saturated, bright red (or near-red) colour: reserved for robots. */
export function isRobotRed(hex: string): boolean {
  const [red, green, blue] = hexToRgb(hex).map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  if (delta === 0) return false;

  let hue: number;
  if (max === red) hue = (((green - blue) / delta) % 6) * 60;
  else if (max === green) hue = ((blue - red) / delta + 2) * 60;
  else hue = ((red - green) / delta + 4) * 60;
  if (hue < 0) hue += 360;

  const nearRed = hue <= ROBOT_HUE_DEGREES || hue >= 360 - ROBOT_HUE_DEGREES;
  return nearRed && delta / max >= ROBOT_MIN_SATURATION && max >= ROBOT_MIN_VALUE;
}

export function isAllowedColor(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex) && !isRobotRed(hex);
}

/** Turns the picker's per-part choices (null = default) into a look, or null if nothing was customised. */
export function resolveLook(headband: string | null, belt: string | null): Look | null {
  if (headband === null && belt === null) return null;
  return { headband: headband ?? DEFAULT_PART_COLOR, belt: belt ?? DEFAULT_PART_COLOR };
}

export interface SavedLogin {
  name: string;
  headband: string | null;
  belt: string | null;
}

const STORAGE_KEY = 'cellwarz.login';

/** The name and colours used last time, so coming back to the login room is one step; tolerant of anything stored. */
export function loadSavedLogin(): SavedLogin {
  const saved: SavedLogin = { name: '', headband: null, belt: null };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SavedLogin>;
    if (typeof parsed.name === 'string') saved.name = parsed.name;
    if (typeof parsed.headband === 'string' && isAllowedColor(parsed.headband)) saved.headband = parsed.headband;
    if (typeof parsed.belt === 'string' && isAllowedColor(parsed.belt)) saved.belt = parsed.belt;
  } catch {
    // Storage unavailable or corrupt: start from the defaults.
  }

  return saved;
}

export function saveLogin(login: SavedLogin): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(login));
  } catch {
    // Storage unavailable (private mode): the choice just isn't remembered.
  }
}
