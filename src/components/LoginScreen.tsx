import { useEffect, useRef, useState } from 'react';
import { isAllowedColor, LOOK_PALETTE, loadSavedLogin, resolveLook, saveLogin } from '../game/look';
import type { Look } from '../game/look';
import { LoginRoom, PADS, ROOM_HEIGHT, ROOM_WIDTH } from '../game/loginRoom';
import type { PadId } from '../game/loginRoom';
import { RadarPreview } from '../game/radarPreview';
import type { RadarCounts } from '../game/radarPreview';

declare global {
  interface Window {
    /** Test-only introspection hook for the login room (public state only) — see e2e/login-room.spec.ts. */
    __cellwarzLogin?: { room: LoginRoom; radar: RadarPreview };
  }
}

interface LoginScreenProps {
  /** `jump` = a fresh avatar at a random floor spot (Teleport); otherwise re-attach to the existing one (Wake up). */
  onEnter: (loginName: string, jump: boolean, look: Look | null) => void;
}

const MAX_SCALE = 2.5;
const READOUT_INTERVAL_MS = 250;
const ARROW_KEYS: Record<string, 'left' | 'right' | 'jump'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump' };
const LABEL_TOP = 262;
const LABEL_WIDTH = PADS.teleport.halfWidth * 2;
const CUSTOM_COLOR_FALLBACK = '#00f6ff';

function fitScale(): number {
  return Math.min(window.innerWidth / ROOM_WIDTH, window.innerHeight / ROOM_HEIGHT, MAX_SCALE);
}

interface SwatchRowProps {
  id: string;
  title: string;
  value: string | null;
  onPick: (color: string | null) => void;
  onRejected: () => void;
}

function SwatchRow({ id, title, value, onPick, onRejected }: SwatchRowProps) {
  return (
    <div className="swatch-row" id={id}>
      <span className="swatch-title">{title}</span>
      <button
        type="button"
        className={value === null ? 'swatch swatch-default swatch-selected' : 'swatch swatch-default'}
        data-color="default"
        title="Default"
        onClick={() => onPick(null)}
      />
      {LOOK_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          className={value === color ? 'swatch swatch-selected' : 'swatch'}
          data-color={color}
          title={color}
          style={{ background: color }}
          onClick={() => onPick(color)}
        />
      ))}
      <input
        type="color"
        className="swatch-custom"
        title="Custom colour"
        value={value ?? CUSTOM_COLOR_FALLBACK}
        onChange={(event) => (isAllowedColor(event.target.value) ? onPick(event.target.value) : onRejected())}
      />
    </div>
  );
}

export function LoginScreen({ onEnter }: LoginScreenProps) {
  const [saved] = useState(loadSavedLogin);
  const [loginName, setLoginName] = useState(saved.name);
  const [headband, setHeadband] = useState<string | null>(saved.headband);
  const [belt, setBelt] = useState<string | null>(saved.belt);
  const [wakeAvailable, setWakeAvailable] = useState(false);
  const [counts, setCounts] = useState<RadarCounts | null>(null);
  const [notice, setNotice] = useState('');
  const [scale, setScale] = useState(fitScale);

  const shipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const roomRef = useRef<LoginRoom | null>(null);
  // The room's callbacks outlive any one render, so they read the latest values through refs.
  const nameRef = useRef(loginName);
  nameRef.current = loginName;
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const colorsRef = useRef({ headband, belt });
  colorsRef.current = { headband, belt };

  useEffect(() => {
    const canvas = shipCanvasRef.current;
    const radarCanvas = radarCanvasRef.current;
    if (!canvas || !radarCanvas) return;

    const radar = new RadarPreview(radarCanvas);
    const room = new LoginRoom(canvas, {
      canTransport: () => nameRef.current.length !== 0,
      onBlocked: () => {
        setNotice('ENTER A CALLSIGN FIRST');
        nameInputRef.current?.focus();
      },
      onTransport: (pad: PadId) => {
        const { headband: chosenHeadband, belt: chosenBelt } = colorsRef.current;
        saveLogin({ name: nameRef.current, headband: chosenHeadband, belt: chosenBelt });
        onEnterRef.current(nameRef.current, pad === 'teleport', resolveLook(chosenHeadband, chosenBelt));
      },
    });
    roomRef.current = room;
    room.setScale(fitScale());
    radar.start();
    room.start();
    window.__cellwarzLogin = { room, radar };

    const onResize = () => {
      const next = fitScale();
      room.setScale(next);
      setScale(next);
    };
    const onKey = (down: boolean) => (event: KeyboardEvent) => {
      const key = ARROW_KEYS[event.key];
      if (!key) return;
      event.preventDefault();
      room.setKey(key, down);
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const readout = setInterval(() => {
      setWakeAvailable(radar.hasLivingAvatar(nameRef.current));
      setCounts(radar.counts());
    }, READOUT_INTERVAL_MS);

    return () => {
      clearInterval(readout);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      room.stop();
      radar.stop();
      roomRef.current = null;
      delete window.__cellwarzLogin;
    };
  }, []);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    room.name = loginName;
    room.wakeAvailable = wakeAvailable;
    room.setLook(resolveLook(headband, belt));
    if (loginName.length !== 0) setNotice('');
  }, [loginName, wakeAvailable, headband, belt]);

  useEffect(() => {
    saveLogin({ name: loginName, headband, belt });
  }, [loginName, headband, belt]);

  const rejectColor = () => setNotice('RED IS RESERVED FOR ROBOTS');
  const padLeft = (pad: PadId) => PADS[pad].centerX - LABEL_WIDTH / 2;

  return (
    <div id="login">
      <div id="ship-stage" style={{ width: ROOM_WIDTH * scale, height: ROOM_HEIGHT * scale }}>
        <canvas id="ship-canvas" ref={shipCanvasRef} />
        <div className="ship-overlay" style={{ transform: `scale(${scale})` }}>
          <div id="input" className="ship-panel">
            <label className="panel-title" htmlFor="loginName">
              CALLSIGN
            </label>
            <input
              id="loginName"
              type="text"
              autoComplete="off"
              autoFocus={loginName.length === 0}
              ref={nameInputRef}
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <SwatchRow id="headband-colors" title="HEADBAND" value={headband} onPick={setHeadband} onRejected={rejectColor} />
            <SwatchRow id="belt-colors" title="BELT" value={belt} onPick={setBelt} onRejected={rejectColor} />
            <div id="login-notice">{notice || 'WALK ONTO A TRANSPORTER (\u2190 \u2192 \u2191)'}</div>
          </div>

          <div id="radar" className="ship-panel">
            <div className="panel-title">LIVE RADAR &middot; MAIN ROOM</div>
            <canvas id="radar-canvas" ref={radarCanvasRef} />
            <div id="radar-readout">
              {counts ? `${counts.pilots} PILOT${counts.pilots === 1 ? '' : 'S'} \u00B7 ${counts.robots} ROBOTS` : 'SCANNING...'}
            </div>
          </div>

          <div id="desc" className="ship-panel">
            <p>
              Welcome raver! Jack into a multi-player, interactively creative, yet competitively destructive orbital
              grid with nothing but your ninja avatar. Cell blocks are light enough to shove, and each colour behaves
              differently: touch or pick one up and see. Break a rainbow block by throwing it and collect the diamonds.
            </p>
            <p>Beware the ninja robots: they reprogram you on contact and fire rockets from afar.</p>
            <p>
              Up: jump &middot; Left/Right: run &middot; Down: put down the block &middot; Space: pick up the block
              under you, again to throw &middot; Escape: leave the grid (your avatar sleeps; WAKE UP returns to it)
            </p>
          </div>

          <button
            type="button"
            id="teleport"
            className="transporter-label"
            style={{ left: padLeft('teleport'), top: LABEL_TOP, width: LABEL_WIDTH, color: PADS.teleport.color }}
            onClick={() => roomRef.current?.useTransporter('teleport')}
          >
            TELEPORT
          </button>
          {wakeAvailable && (
            <button
              type="button"
              id="wakeup"
              className="transporter-label"
              style={{ left: padLeft('wakeup'), top: LABEL_TOP, width: LABEL_WIDTH, color: PADS.wakeup.color }}
              onClick={() => roomRef.current?.useTransporter('wakeup')}
            >
              WAKE UP
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
