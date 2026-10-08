import type { Renderer } from './renderer';

type SendKey = (key: number, down: boolean) => void;

const ARROW_KEYS = [37, 38, 39, 40];
const SWIPE_THRESHOLD = 30;
const TAP_THRESHOLD = 10;
const TAP_MAX_DURATION_MS = 300;

const MOVEMENT_KEYS = [37, 38, 39];

/**
 * Mirrors js/ui.js input handling (chat/typing removed); swipe/tap replaces the old jquery-mobile gestures.
 * Escape isn't sent to the server: it releases any held movement keys (so the avatar left behind doesn't keep
 * running) and calls `onExit` to go back to the login screen.
 */
export function attachInputHandlers(sendKey: SendKey, renderer: Renderer, onExit?: () => void): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      for (const key of MOVEMENT_KEYS) sendKey(key, false);
      onExit?.();
      return;
    }

    if (ARROW_KEYS.includes(event.keyCode)) {
      event.preventDefault();
    }
    sendKey(event.keyCode, true);
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return;
    sendKey(event.keyCode, false);
  };

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
  };

  const handleTouchEnd = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const duration = Date.now() - touchStartTime;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      sendKey(dx < 0 ? 37 : 39, true);
    } else if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD && duration < TAP_MAX_DURATION_MS) {
      const { me, offsetY } = renderer.getPlayerOffset();
      if (me && touch.clientY < me[2] - offsetY) {
        sendKey(38, true);
        sendKey(38, false);
      } else {
        sendKey(37, false);
        sendKey(39, false);
      }
    }
  };

  document.body.addEventListener('keydown', handleKeyDown);
  document.body.addEventListener('keyup', handleKeyUp);
  window.addEventListener('touchstart', handleTouchStart);
  window.addEventListener('touchend', handleTouchEnd);

  return () => {
    document.body.removeEventListener('keydown', handleKeyDown);
    document.body.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('touchstart', handleTouchStart);
    window.removeEventListener('touchend', handleTouchEnd);
  };
}
