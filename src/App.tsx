import { useEffect, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { LoginScreen } from './components/LoginScreen';
import type { Look } from './game/look';
import { unlockAudioSession } from './game/audio';
import { enterImmersiveMode, isTouchDevice } from './game/touchDevice';

interface Session {
  loginName: string;
  hash: string;
  jump: boolean;
  look: Look | null;
}

/** Shown (by CSS) only while a touch device is held upright: the game is landscape-only. */
function RotatePrompt() {
  return (
    <div id="rotate-prompt">
      <div id="rotate-icon">{'\u21BB'}</div>
      <div>ROTATE YOUR PHONE</div>
      <div id="rotate-sub">CYBERSTATION PLAYS IN LANDSCAPE</div>
    </div>
  );
}

export function App() {
  const touch = isTouchDevice();
  // Fullscreen needs a tap; the first one anywhere does it, once.
  useEffect(() => {
    if (!touch) return;
    window.addEventListener('pointerup', enterImmersiveMode, { once: true });
    return () => window.removeEventListener('pointerup', enterImmersiveMode);
  }, [touch]);

  // Browsers (phones above all) keep sound off until a tap, click or key press: the first ones anywhere switch it on, so the
  // game's music can start by itself once the player is in.
  useEffect(() => {
    const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
    const stop = () => events.forEach((name) => window.removeEventListener(name, unlock, true));
    function unlock() {
      void unlockAudioSession().then((running) => {
        if (running) stop();
      });
    }
    events.forEach((name) => window.addEventListener(name, unlock, true));
    return stop;
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  // The hash typed this visit, kept across leaving the game (the login screen also remembers it on this device).
  const [hash, setHash] = useState('');
  // Why the player was sent back to the login screen, when it wasn't their choice (wrong hash, logged in elsewhere).
  const [notice, setNotice] = useState('');

  return (
    <>
      {session ? (
        <GameCanvas
          loginName={session.loginName}
          hash={session.hash}
          jump={session.jump}
          look={session.look}
          onExit={(reason) => {
            setNotice(reason ?? '');
            setSession(null);
          }}
        />
      ) : (
        <LoginScreen
          initialHash={hash}
          initialNotice={notice}
          onEnter={(loginName, enteredHash, jump, look) => {
            setHash(enteredHash);
            setNotice('');
            setSession({ loginName, hash: enteredHash, jump, look });
          }}
        />
      )}
      {touch && <RotatePrompt />}
    </>
  );
}
