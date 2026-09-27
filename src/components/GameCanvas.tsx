import { useEffect, useRef } from 'react';
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
}

export function GameCanvas({ loginName, jump }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backgroundRef = useRef<HTMLDivElement | null>(null);
  const dashboardRef = useRef<HTMLDivElement | null>(null);

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
      dashboardEl: dashboardRef.current,
      images: [],
      loginName,
      analyzer,
    });

    const syncer = new Syncer(renderer, loginName, jump, analyzer);
    syncer.connect();

    const detachInput = attachInputHandlers((key, down) => syncer.sendKey(key, down), renderer);

    window.__cellwarz = { renderer };

    return () => {
      detachInput();
      syncer.close();
      analyzer.stop();
      delete window.__cellwarz;
    };
  }, [loginName, jump]);

  return (
    <>
      <div id="canvas-bg" ref={backgroundRef} style={{ display: 'block' }} />
      <canvas id="canvas" ref={canvasRef} />
      <div id="mana1" className="dash-icon" ref={dashboardRef} />
      <div id="mana2" className="dash-icon" />
      <div id="mana3" className="dash-icon" />
    </>
  );
}
