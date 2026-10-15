/** Whether this is a phone/tablet-style device whose main pointer is a finger (a laptop with a touchscreen is not). */
export function isTouchDevice(win: Pick<Window, 'matchMedia' | 'location'> = window): boolean {
  // `?touch=1` / `?touch=0` force the answer, for hybrid devices and for testing the touch layout on a desktop.
  const forced = new URLSearchParams(win.location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return win.matchMedia?.('(pointer: coarse)').matches ?? false;
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
