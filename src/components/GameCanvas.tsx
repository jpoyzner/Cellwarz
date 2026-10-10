import { useEffect, useRef, useState } from 'react';
import { Analyzer } from '../game/analyzer';
import type { Look } from '../game/look';
import { Recorder } from '../game/recorder';
import { Renderer } from '../game/renderer';
import type { SpectatorMode } from '../game/renderer';
import { Syncer } from '../game/syncer';
import { attachInputHandlers } from '../game/ui';

declare global {
  interface Window {
    /** Test-only introspection hook (public game state, no secrets) — see e2e/*.spec.ts. */
    __cellwarz?: { renderer: Renderer; syncer: Syncer; recorder: Recorder };
  }
}

interface GameCanvasProps {
  loginName: string;
  jump: boolean;
  look: Look | null;
  /** Called when the player presses Escape to leave the game. */
  onExit: () => void;
}

export function GameCanvas({ loginName, jump, look, onExit }: GameCanvasProps) {
  // Read through a ref so a new callback identity from the parent never tears down the running game.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundRef = useRef<HTMLDivElement | null>(null);
  const scoreRef = useRef<HTMLDivElement | null>(null);
  const diamondsRef = useRef<HTMLDivElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [spectator, setSpectator] = useState<SpectatorMode>('off');
  // Milliseconds left in the debug recording (backtick key), or null when not recording.
  const [recordingMsLeft, setRecordingMsLeft] = useState<number | null>(null);

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

    const syncer = new Syncer(renderer, loginName, jump, look, analyzer);
    syncer.connect();
    // An idle player is sent back to the login screen (same as pressing Escape) instead of watching a frozen level.
    syncer.onInactive = () => onExitRef.current();
    renderer.onSpectatorChange = setSpectator;
    renderer.onBlocksCollected = (blocks) => syncer.sendBlocksCollected(blocks);

    const recorder = new Recorder({
      login: loginName,
      snapshot: () => renderer.snapshot(),
      onFinished: (recording) => syncer.sendRecording(recording),
      onChange: setRecordingMsLeft,
    });
    syncer.recorder = recorder;

    const detachInput = attachInputHandlers(
      (key, down) => {
        syncer.sendKey(key, down);
        renderer.onLocalKey(key, down);
      },
      renderer,
      () => onExitRef.current(),
      () => recorder.toggle(),
    );

    window.__cellwarz = { renderer, syncer, recorder };

    return () => {
      // Ship an in-progress recording before the socket closes (Escape's key-ups are already in it).
      recorder.stop('exit');
      detachInput();
      syncer.close();
      renderer.stop();
      rendererRef.current = null;
      analyzer.stop();
      delete window.__cellwarz;
    };
  }, [loginName, jump, look]);

  return (
    <>
      <div id="canvas-bg" ref={backgroundRef} />
      <canvas id="canvas" ref={canvasRef} />
      <div id="crt" />
      <div id="score" ref={scoreRef} />
      <div id="diamonds" ref={diamondsRef} />
      {recordingMsLeft !== null && (
        <div id="recording">REC {(recordingMsLeft / 1000).toFixed(1)}s &middot; ` TO STOP</div>
      )}
      {spectator !== 'off' && (
        <div id="spectator">
          <div id="spectator-title">
            {spectator === 'following' ? 'YOU WERE ASSIMILATED' : spectator === 'asleep' ? 'YOUR AVATAR IS ASLEEP' : 'YOU DIED'}
          </div>
          <div id="spectator-hint">
            {spectator === 'following'
              ? 'SPECTATING YOUR ROBOT BODY \u00B7 ARROW KEYS: FREE CAMERA \u00B7 ESC: LEAVE'
              : spectator === 'asleep'
                ? 'SPECTATING \u00B7 ARROW KEYS: MOVE CAMERA \u00B7 SPACE: WAKE UP \u00B7 ESC: LEAVE'
                : 'SPECTATING \u00B7 ARROW KEYS: MOVE CAMERA \u00B7 ESC: LEAVE'}
          </div>
        </div>
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
