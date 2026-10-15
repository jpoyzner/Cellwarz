import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { SpectatorMode } from '../game/renderer';
import { vibrate } from '../game/touchDevice';
import { TouchKeyState } from '../game/touchKeys';

// Key codes the server's UI understands (server/ui.ts).
const LEFT = 37;
const UP = 38;
const RIGHT = 39;
const DOWN = 40;
const SPACE = 32;
const SHIFT = 16;
const DIGIT_0 = 48;

// Mirrors NUMBER_EMOJIS in server/emoji.ts, in keyboard order 1..9 then 0.
const EMOJI_PICKER = [
  { digit: 1, emoji: '\u{1F44B}' },
  { digit: 2, emoji: '\u{1F44D}' },
  { digit: 3, emoji: '\u{1F602}' },
  { digit: 4, emoji: '\u{1F62E}' },
  { digit: 5, emoji: '\u{1F525}' },
  { digit: 6, emoji: '\u2764\uFE0F' },
  { digit: 7, emoji: '\u{1F608}' },
  { digit: 8, emoji: '\u{1F914}' },
  { digit: 9, emoji: '\u{1F198}' },
  { digit: 0, emoji: '\u{1F634}' },
];

interface TouchControlsProps {
  /** The same key pipeline the keyboard uses (server message plus local prediction). */
  sendKey: (key: number, down: boolean) => void;
  spectator: SpectatorMode;
  /** The local avatar has a block overhead (the Action button then throws instead of grabbing). */
  carrying: boolean;
  /** The menu button: same as Escape. */
  onMenu: () => void;
  /** Called on every tap so the browser lets audio start. */
  onTap: () => void;
}

interface HoldButtonProps {
  id: string;
  className: string;
  keyCode: number;
  state: TouchKeyState;
  held: ReadonlySet<number>;
  haptic?: boolean;
  children: ReactNode;
}

// A finger that slides off the button keeps its pointer capture, so the release always arrives here.
function HoldButton({ id, className, keyCode, state, held, haptic, children }: HoldButtonProps) {
  return (
    <div
      id={id}
      role="button"
      className={held.has(keyCode) ? `${className} touch-button touch-held` : `${className} touch-button`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        state.set(event.pointerId, keyCode);
        if (haptic) vibrate(12);
      }}
      onPointerUp={(event) => state.set(event.pointerId, undefined)}
      onPointerCancel={(event) => state.set(event.pointerId, undefined)}
      onLostPointerCapture={(event) => state.set(event.pointerId, undefined)}
    >
      {children}
    </div>
  );
}

/**
 * The on-screen gamepad for phones (landscape): a run pad on the left, Jump / Action / Star / Down on the right, and
 * Emoji + Menu along the top. Every button sends the same key codes as the keyboard, so the server is untouched.
 * Plain divs, not <button>s: a focused button would also fire on Space (the in-game block key).
 */
export function TouchControls({ sendKey, spectator, carrying, onMenu, onTap }: TouchControlsProps) {
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());
  const [emojiOpen, setEmojiOpen] = useState(false);
  const sendKeyRef = useRef(sendKey);
  sendKeyRef.current = sendKey;
  const stateRef = useRef<TouchKeyState | null>(null);
  if (!stateRef.current) {
    stateRef.current = new TouchKeyState((key, down) => sendKeyRef.current(key, down));
    stateRef.current.onChange = () => setHeld(stateRef.current!.heldKeys());
  }
  const state = stateRef.current;

  // A key held while the page is hidden or the controls vanish would otherwise stay down for good.
  useEffect(() => {
    const release = () => state.releaseAll();
    const onVisibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', release);
      window.removeEventListener('pagehide', release);
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [state]);

  useEffect(() => {
    state.releaseAll();
    setEmojiOpen(false);
  }, [spectator, state]);

  const playing = spectator === 'off';
  const spectating = spectator === 'asleep';

  // One pad, two halves: sliding the thumb across it switches direction without lifting.
  const runKeyAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX - rect.left < rect.width / 2 ? LEFT : RIGHT;
  };

  return (
    <div id="touch-controls" onPointerUp={onTap} onPointerDown={onTap} onContextMenu={(event) => event.preventDefault()}>
      <div
        id="touch-run"
        role="group"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          state.set(event.pointerId, runKeyAt(event));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) state.set(event.pointerId, runKeyAt(event));
        }}
        onPointerUp={(event) => state.set(event.pointerId, undefined)}
        onPointerCancel={(event) => state.set(event.pointerId, undefined)}
        onLostPointerCapture={(event) => state.set(event.pointerId, undefined)}
      >
        <div id="touch-left" className={held.has(LEFT) ? 'touch-half touch-held' : 'touch-half'}>
          {'\u25C0'}
        </div>
        <div id="touch-right" className={held.has(RIGHT) ? 'touch-half touch-held' : 'touch-half'}>
          {'\u25B6'}
        </div>
      </div>

      {(playing || spectating) && (
        <HoldButton id="touch-action" className="touch-round touch-action" keyCode={SPACE} state={state} held={held} haptic>
          {spectating ? 'WAKE' : carrying ? 'THROW' : 'GRAB'}
        </HoldButton>
      )}
      {playing && (
        <>
          <HoldButton id="touch-jump" className="touch-round touch-jump" keyCode={UP} state={state} held={held}>
            JUMP
          </HoldButton>
          <HoldButton id="touch-star" className="touch-round touch-star" keyCode={SHIFT} state={state} held={held} haptic>
            {'\u2605'}
          </HoldButton>
          <HoldButton id="touch-down" className="touch-round touch-down" keyCode={DOWN} state={state} held={held}>
            {'\u25BC'}
          </HoldButton>
          <div
            id="touch-emoji"
            role="button"
            className="touch-button touch-small"
            aria-label="Emoji"
            onClick={() => setEmojiOpen((open) => !open)}
          >
            {'\u263A'}
          </div>
        </>
      )}
      <div id="touch-menu" role="button" className="touch-button touch-small" aria-label="Menu" onClick={onMenu}>
        {'\u2630'}
      </div>

      {emojiOpen && (
        <>
          <div id="touch-emoji-backdrop" onClick={() => setEmojiOpen(false)} />
          <div id="touch-emoji-picker">
            {EMOJI_PICKER.map(({ digit, emoji }) => (
              <div
                key={digit}
                role="button"
                className="touch-button touch-emoji-choice"
                data-digit={digit}
                onClick={() => {
                  sendKey(DIGIT_0 + digit, true);
                  sendKey(DIGIT_0 + digit, false);
                  setEmojiOpen(false);
                }}
              >
                {emoji}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
