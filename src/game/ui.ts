import type { Renderer } from './renderer';

type SendKey = (key: number, down: boolean) => void;

const ARROW_KEYS = [37, 38, 39, 40];

const MOVEMENT_KEYS = [37, 38, 39];
// Mirrors server/ui.ts: tells the server the player pressed Escape while alive.
const ESCAPE_KEY = 27;
// Space (pick up / throw), Down (put down) and Shift (throw a ninja star): each press is one action.
const ONE_SHOT_KEYS = [32, 40, 16];
// Number row (48-57) and numpad (96-105): each shows an emoji bubble (the server maps the digit, see server/emoji.ts).
const isNumberKey = (keyCode: number) => (keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105);

/**
 * Escape (the touch menu button does the same): releases any held movement keys (so the avatar left behind doesn't keep
 * running). While the avatar is alive it tells the server to put it to sleep and the player spectates it; otherwise
 * (dead, asleep, inactive) it calls `onExit` to go back to the login screen.
 */
export function pressEscape(sendKey: SendKey, renderer: Renderer, onExit?: () => void): void {
  for (const key of MOVEMENT_KEYS) sendKey(key, false);
  if (renderer.canFallAsleep()) {
    // First Escape: the avatar goes to sleep where it stands and the player spectates; the next one leaves.
    sendKey(ESCAPE_KEY, true);
  } else {
    onExit?.();
  }
}

/**
 * Mirrors js/ui.js input handling (chat/typing removed); touch devices use the on-screen buttons instead
 * (see TouchControls). Backtick calls `onToggleBlackBox`.
 */
export function attachInputHandlers(
  sendKey: SendKey,
  renderer: Renderer,
  onExit?: () => void,
  onToggleBlackBox?: () => void,
): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    // Backtick toggles the Black Box recorder; it's a client-side tool, never sent to the server.
    if (event.key === '`') {
      event.preventDefault();
      if (!event.repeat) onToggleBlackBox?.();
      return;
    }

    if (event.key === 'Escape') {
      pressEscape(sendKey, renderer, onExit);
      return;
    }

    if (ARROW_KEYS.includes(event.keyCode)) {
      event.preventDefault();
    }
    // Holding Space (pick up, then throw), Down (put down), Shift (ninja star) or a number (emoji) must not auto-repeat into a second action.
    if (event.repeat && (ONE_SHOT_KEYS.includes(event.keyCode) || isNumberKey(event.keyCode))) return;
    sendKey(event.keyCode, true);
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === '`') return;
    sendKey(event.keyCode, false);
  };

  document.body.addEventListener('keydown', handleKeyDown);
  document.body.addEventListener('keyup', handleKeyUp);

  return () => {
    document.body.removeEventListener('keydown', handleKeyDown);
    document.body.removeEventListener('keyup', handleKeyUp);
  };
}
