import { useEffect, useRef, useState } from 'react';
import { Analyzer } from '../game/analyzer';
import { Renderer } from '../game/renderer';
import { Syncer } from '../game/syncer';
import { attachInputHandlers } from '../game/ui';

declare global {
  interface Window {
    /** Test-only introspection hook (public game state, no secrets) — see e2e/*.spec.ts. */
    __cellwarz?: { renderer: Renderer };
  }
}

interface GameCanvasProps {
  loginName: string;
  jump: boolean;
  /** Called when the player presses Escape to leave the game. */
  onExit: () => void;
}

export function GameCanvas({ loginName, jump, onExit }: GameCanvasProps) {
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

    const syncer = new Syncer(renderer, loginName, jump, analyzer);
    syncer.connect();
    renderer.onBlocksCollected = (blocks) => syncer.sendBlocksCollected(blocks);

    const detachInput = attachInputHandlers((key, down) => {
      syncer.sendKey(key, down);
      renderer.onLocalKey(key, down);
    }, renderer, () => onExitRef.current());

    window.__cellwarz = { renderer };

    return () => {
      detachInput();
      syncer.close();
      renderer.stop();
      rendererRef.current = null;
      analyzer.stop();
      delete window.__cellwarz;
    };
  }, [loginName, jump]);

  return (
    <>
      <div id="canvas-bg" ref={backgroundRef} />
      <canvas id="canvas" ref={canvasRef} />
      <div id="crt" />
      <div id="score" ref={scoreRef} />
      <div id="diamonds" ref={diamondsRef} />
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
