// A touch screen whose shorter side (CSS pixels) is at most this is a phone, whatever the browser claims about its pointer.
const PHONE_MAX_SHORT_SIDE_PX = 500;

type TouchProbe = Pick<Window, 'matchMedia' | 'location'> & Partial<{ navigator: Pick<Navigator, 'maxTouchPoints'>; screen: Pick<Screen, 'width' | 'height'> }>;

/**
 * Whether this is a phone/tablet-style device whose main pointer is a finger (a laptop with a touchscreen is not).
 * Some phones report a fine pointer (Chrome's "desktop site" mode, some in-app browsers), so a touch screen as small as a
 * phone's counts too.
 */
export function isTouchDevice(win: TouchProbe = window): boolean {
  // `?touch=1` / `?touch=0` force the answer, for hybrid devices and for testing the touch layout on a desktop.
  const forced = new URLSearchParams(win.location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  if (win.matchMedia?.('(pointer: coarse)').matches) return true;

  const touchPoints = win.navigator?.maxTouchPoints ?? 0;
  const shortSide = Math.min(win.screen?.width ?? Infinity, win.screen?.height ?? Infinity);
  return touchPoints > 0 && shortSide <= PHONE_MAX_SHORT_SIDE_PX;
}

let immersiveTried = false;

/**
 * Goes fullscreen and locks the screen to landscape. Browsers only allow this from a tap, so it is called from the first
 * one; it is tried once per page load (a player who backs out of fullscreen isn't nagged). iOS Safari has neither API,
 * so there it silently does nothing.
 */
export function enterImmersiveMode(): void {
  if (immersiveTried) return;
  immersiveTried = true;

  const root = document.documentElement;
  if (!root.requestFullscreen || document.fullscreenElement) return;
  root
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as { lock?: (orientation: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined); // refused (or no lock support): the game still works windowed.
}

/** A short haptic pulse where the browser supports it (not iOS). */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration can be blocked by a permissions policy; it is only polish.
  }
}
