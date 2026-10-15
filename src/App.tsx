import { useEffect, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { LoginScreen } from './components/LoginScreen';
import type { Look } from './game/look';
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

  const [session, setSession] = useState<Session | null>(null);
  // The hash is never saved to storage, but survives leaving the game within the page so a wake-up doesn't need it retyped.
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
