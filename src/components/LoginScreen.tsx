import { useEffect, useRef, useState } from 'react';
import { LOOK_PALETTE, loadSavedLogin, resolveLook, saveLogin } from '../game/look';
import type { Look } from '../game/look';
import { LoginRoom, PADS, ROOM_HEIGHT, ROOM_WIDTH } from '../game/loginRoom';
import type { PadId } from '../game/loginRoom';
import { ControlsDemo } from '../game/controlsDemo';
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

// The blocks MainRoom actually scatters (art from public/images/mana), with what each does in two short lines.
const BLOCK_LEGEND = [
  { id: 'yellow', image: 'engine/engine', lines: ['LIFTS', 'YOU UP'] },
  { id: 'red', image: 'launcher/launcher', lines: ['5s FUSE,', 'THEN BOOM'] },
  { id: 'blue', image: 'ice/ice', lines: ['SLIDES', 'FOREVER'] },
  { id: 'green', image: 'shield/shield', lines: ['SHIELD', 'BUBBLE'] },
  { id: 'orange', image: 'sticky/sticky', lines: ['GLUES', 'BLOCKS'] },
  { id: 'rainbow', image: 'rainbow/rainbow1', lines: ['THROW IT', 'FOR \u{1F48E}'] },
];

// Mirrors server/ui.ts and src/game/ui.ts; the first row is the one the demo clip performs.
const CONTROL_KEYS = [
  { keys: ['SPACE'], action: 'GRAB / THROW' },
  { keys: ['\u2193'], action: 'PUT DOWN' },
  { keys: ['\u2190', '\u2192'], action: 'RUN' },
  { keys: ['\u2191'], action: 'JUMP' },
  { keys: ['ENTER'], action: 'NINJA STAR' },
  { keys: ['ESC'], action: 'LEAVE' },
];

function fitScale(): number {
  return Math.min(window.innerWidth / ROOM_WIDTH, window.innerHeight / ROOM_HEIGHT, MAX_SCALE);
}

interface SwatchRowProps {
  id: string;
  title: string;
  value: string | null;
  onPick: (color: string | null) => void;
}

function SwatchRow({ id, title, value, onPick }: SwatchRowProps) {
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
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const demoRef = useRef<ControlsDemo | null>(null);
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
        setNotice('NO TELEPORT: TYPE A CALLSIGN FIRST!');
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
    const demoCanvas = demoCanvasRef.current;
    const demo = demoCanvas ? new ControlsDemo(demoCanvas) : null;
    demoRef.current = demo;
    demo?.setLook(resolveLook(colorsRef.current.headband, colorsRef.current.belt));
    demo?.start();
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
      demo?.stop();
      roomRef.current = null;
      demoRef.current = null;
      delete window.__cellwarzLogin;
    };
  }, []);

  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    room.name = loginName;
    room.wakeAvailable = wakeAvailable;
    room.setLook(resolveLook(headband, belt));
    demoRef.current?.setLook(resolveLook(headband, belt));
    if (loginName.length !== 0) setNotice('');
  }, [loginName, wakeAvailable, headband, belt]);

  useEffect(() => {
    saveLogin({ name: loginName, headband, belt });
  }, [loginName, headband, belt]);

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
              className={notice ? 'input-error' : undefined}
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
            <SwatchRow id="headband-colors" title="HEADBAND" value={headband} onPick={setHeadband} />
            <SwatchRow id="belt-colors" title="BELT" value={belt} onPick={setBelt} />
            <div id="login-notice" className={notice ? 'login-notice-error' : undefined} role={notice ? 'alert' : undefined}>
              {notice || 'WALK ONTO A TRANSPORTER (\u2190 \u2192 \u2191)'}
            </div>
          </div>

          <div id="radar" className="ship-panel">
            <div className="panel-title">LIVE RADAR &middot; MAIN ROOM</div>
            <canvas id="radar-canvas" ref={radarCanvasRef} />
            <div id="radar-readout">
              {counts ? `${counts.pilots} AVATAR${counts.pilots === 1 ? '' : 'S'} \u00B7 ${counts.robots} ROBOTS` : 'SCANNING...'}
            </div>
          </div>

          <div id="desc" className="ship-panel">
            <p>
              Welcome to the Cyberstation, a multi-player, interactively creative, yet competitively destructive
              orbital cyberworld. Use the cyberblocks wisely, mind the gravity, and beware the robots: they will try to assimilate you.
            </p>
            <div id="controls">
              <canvas id="controls-demo" ref={demoCanvasRef} />
              <ul id="control-keys">
                {CONTROL_KEYS.map(({ keys, action }) => (
                  <li key={action}>
                    <span className="keys">
                      {keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
            <p id="controls-note">ESC: leave, avatar sleeps.</p>
          </div>

          <div id="legend" className="ship-panel">
            <div className="panel-title">BLOCK INDEX &middot; TOUCH OR GRAB ONE</div>
            <ul>
              {BLOCK_LEGEND.map(({ id, image, lines }) => (
                <li key={id} data-block={id}>
                  <img src={`/images/mana/${image}.png`} alt={`${id} block`} width={24} height={24} />
                  <span>
                    {lines[0]}
                    <br />
                    {lines[1]}
                  </span>
                </li>
              ))}
            </ul>
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
