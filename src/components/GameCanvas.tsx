import { useEffect, useRef, useState } from 'react';
import { Analyzer } from '../game/analyzer';
import type { DeathCard } from '../game/deathCause';
import type { Hint } from '../game/hints';
import type { Look } from '../game/look';
import { BlackBox } from '../game/blackBox';
import { Renderer } from '../game/renderer';
import type { SpectatorMode } from '../game/renderer';
import { Syncer } from '../game/syncer';
import { isTouchDevice, vibrate } from '../game/touchDevice';
import { attachInputHandlers, pressEscape } from '../game/ui';
import { TouchControls } from './TouchControls';

declare global {
  interface Window {
    /** Test-only introspection hook (public game state, no secrets) — see e2e/*.spec.ts. */
    __cellwarz?: { renderer: Renderer; syncer: Syncer; blackBox: BlackBox };
  }
}

const HASH_DENIED_NOTICE = 'WRONG HASH: THAT CALLSIGN IS PROTECTED';
const DISPLACED_NOTICE = 'LOGGED IN FROM ELSEWHERE: DISCONNECTED';
const FULL_NOTICE = 'STATION IS AT CAPACITY: TRY AGAIN SOON';
const THROTTLED_NOTICE = 'TOO MANY WRONG HASHES: WAIT A FEW MINUTES';
const INVALID_NOTICE = "INVALID CALLSIGN: LETTERS, NUMBERS AND - _ . ' ONLY, 32 MAX";
const RESERVED_NOTICE = 'THAT CALLSIGN IS RESERVED: PICK ANOTHER';
const CONNECTION_LOST_NOTICE = 'CONNECTION LOST: THE STATION IS UNREACHABLE';

interface GameCanvasProps {
  loginName: string;
  hash: string;
  jump: boolean;
  look: Look | null;
  /** Called when the player leaves the game (Escape, idling, a wrong hash or being logged in from elsewhere); `notice` says why if it wasn't their choice. */
  onExit: (notice?: string) => void;
}

export function GameCanvas({ loginName, hash, jump, look, onExit }: GameCanvasProps) {
  // Read through a ref so a new callback identity from the parent never tears down the running game.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundRef = useRef<HTMLDivElement | null>(null);
  const scoreRef = useRef<HTMLDivElement | null>(null);
  const diamondsRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  // The keyboard/touch key pipeline of the running game (set by the effect below), so the touch buttons share it.
  const sendKeyRef = useRef<(key: number, down: boolean) => void>(() => undefined);
  const onMenuRef = useRef<() => void>(() => undefined);
  const touch = useRef(isTouchDevice()).current;
  const [carrying, setCarrying] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [spectator, setSpectator] = useState<SpectatorMode>('off');
  const [hint, setHint] = useState<Hint | null>(null);
  const [deathCard, setDeathCard] = useState<DeathCard | null>(null);
  // Milliseconds left in the Black Box recording (backtick key), or null when it isn't recording.
  const [blackBoxMsLeft, setBlackBoxMsLeft] = useState<number | null>(null);
  // True while the link to the server is down and being retried.
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    rendererRef.current?.setMinimapOpen(minimapOpen);
  }, [minimapOpen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.globalAlpha = 1;

    const analyzer = new Analyzer();
    analyzer.start();

    const renderer = new Renderer({
      ctx,
      canvas,
      backgroundEl: backgroundRef.current,
      scoreEl: scoreRef.current,
      diamondsEl: diamondsRef.current,
      minimapCanvas: minimapCanvasRef.current,
      images: [],
      loginName,
      analyzer,
    });
    rendererRef.current = renderer;

    const syncer = new Syncer(renderer, loginName, hash, jump, look, analyzer);
    syncer.connect();
    // An idle player is sent back to the login screen (same as pressing Escape) instead of watching a frozen level.
    syncer.onInactive = () => onExitRef.current();
    syncer.onDenied = () => onExitRef.current(HASH_DENIED_NOTICE);
    syncer.onDisplaced = () => onExitRef.current(DISPLACED_NOTICE);
    syncer.onFull = () => onExitRef.current(FULL_NOTICE);
    syncer.onThrottled = () => onExitRef.current(THROTTLED_NOTICE);
    syncer.onInvalid = (reserved) => onExitRef.current(reserved ? RESERVED_NOTICE : INVALID_NOTICE);
    syncer.onGaveUp = () => onExitRef.current(CONNECTION_LOST_NOTICE);
    syncer.onConnectionChange = (connected) => setReconnecting(!connected);
    renderer.onSpectatorChange = (mode) => {
      setSpectator(mode);
      if (mode === 'off') setDeathCard(null);
      if (mode === 'free' && touch) vibrate([60, 40, 140]);
    };
    renderer.onCarryingChange = setCarrying;
    setCarrying(false);
    setHint(null);
    setDeathCard(null);
    renderer.onDeathCard = setDeathCard;
    renderer.hints.onChange = setHint;
    renderer.onBlocksCollected = (blocks) => syncer.sendBlocksCollected(blocks);

    const blackBox = new BlackBox({
      login: loginName,
      snapshot: () => renderer.snapshot(),
      onStarted: () => syncer.sendBlackBoxStarted(),
      onFinished: (recording) => syncer.sendBlackBox(recording),
      onChange: setBlackBoxMsLeft,
    });
    syncer.blackBox = blackBox;

    const sendKey = (key: number, down: boolean) => {
      syncer.sendKey(key, down);
      renderer.onLocalKey(key, down);
    };
    const detachInput = attachInputHandlers(sendKey, renderer, () => onExitRef.current(), () => {
      // Recording is a local-development tool: the server only says so in its payload when it accepts recordings.
      if (syncer.blackBoxEnabled) blackBox.toggle();
    });
    sendKeyRef.current = sendKey;
    onMenuRef.current = () => pressEscape(sendKey, renderer, () => onExitRef.current());

    // Rotating the phone or leaving fullscreen resizes the window; the canvas and camera follow (touch devices only).
    const onResize = () => renderer.resize(window.innerWidth, window.innerHeight);
    if (touch) window.addEventListener('resize', onResize);

    window.__cellwarz = { renderer, syncer, blackBox };

    return () => {
      // Ship an in-progress Black Box before the socket closes (Escape's key-ups are already in it).
      blackBox.stop('exit');
      detachInput();
      window.removeEventListener('resize', onResize);
      sendKeyRef.current = () => undefined;
      syncer.close();
      renderer.stop();
      rendererRef.current = null;
      analyzer.stop();
      delete window.__cellwarz;
    };
  }, [loginName, hash, jump, look, touch]);

  return (
    <>
      <div id="canvas-bg" ref={backgroundRef} />
      <canvas id="canvas" ref={canvasRef} />
      <div id="crt" />
      <div id="score" ref={scoreRef} />
      <div id="diamonds" ref={diamondsRef} />
      {reconnecting && <div id="reconnecting">LINK LOST &middot; RECONNECTING TO THE STATION...</div>}
      {blackBoxMsLeft !== null && (
        <div id="black-box">BLACK BOX REC {(blackBoxMsLeft / 1000).toFixed(1)}s &middot; ` TO STOP</div>
      )}
      {spectator !== 'off' && (
        <div id="spectator">
          <div id="spectator-title">
            {spectator === 'following' ? 'YOU WERE ASSIMILATED' : spectator === 'asleep' ? 'YOUR AVATAR IS ASLEEP' : 'YOU DIED'}
          </div>
          <div id="spectator-hint">
            {touch
              ? spectator === 'following'
                ? 'SPECTATING YOUR ROBOT BODY \u00B7 \u25C0 \u25B6: FREE CAMERA \u00B7 \u2630: LEAVE'
                : spectator === 'asleep'
                  ? 'SPECTATING \u00B7 \u25C0 \u25B6: MOVE CAMERA \u00B7 WAKE: WAKE UP \u00B7 \u2630: LEAVE'
                  : 'SPECTATING \u00B7 \u25C0 \u25B6: MOVE CAMERA \u00B7 \u2630: LEAVE'
              : spectator === 'following'
                ? 'SPECTATING YOUR ROBOT BODY \u00B7 ARROW KEYS: FREE CAMERA \u00B7 ESC: LEAVE'
                : spectator === 'asleep'
                  ? 'SPECTATING \u00B7 ARROW KEYS: MOVE CAMERA \u00B7 SPACE: WAKE UP \u00B7 ESC: LEAVE'
                  : 'SPECTATING \u00B7 ARROW KEYS: MOVE CAMERA \u00B7 ESC: LEAVE'}
          </div>
          {spectator === 'free' && deathCard && (
            <div id="death-card">
              <div id="death-cause">{deathCard.cause}</div>
              <div id="death-tip">{deathCard.tip}</div>
            </div>
          )}
        </div>
      )}
      {spectator === 'off' && hint && (
        <div id="hint" data-hint={hint.id}>
          {hint.text}
        </div>
      )}
      {touch && (
        <TouchControls
          sendKey={(key, down) => sendKeyRef.current(key, down)}
          spectator={spectator}
          carrying={carrying}
          onMenu={() => onMenuRef.current()}
          onTap={() => rendererRef.current?.unlockAudio()}
        />
      )}
      {/* Not a <button>: a focused button would also fire on Space, which is the in-game block pickup/throw key. */}
      <div id="minimap" className={minimapOpen ? 'minimap' : 'minimap minimap-closed'}>
        <canvas id="minimap-canvas" ref={minimapCanvasRef} />
        <div
          id="minimap-toggle"
          role="button"
          aria-label={minimapOpen ? 'Close minimap' : 'Open minimap'}
          title={minimapOpen ? 'Close minimap' : 'Open minimap'}
          onClick={() => setMinimapOpen((open) => !open)}
        >
          {minimapOpen ? '\u2715' : '\u25A6'}
        </div>
      </div>
    </>
  );
}
