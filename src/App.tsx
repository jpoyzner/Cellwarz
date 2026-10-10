import { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { LoginScreen } from './components/LoginScreen';
import type { Look } from './game/look';

interface Session {
  loginName: string;
  jump: boolean;
  look: Look | null;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  if (!session) {
    return <LoginScreen onEnter={(loginName, jump, look) => setSession({ loginName, jump, look })} />;
  }

  return <GameCanvas loginName={session.loginName} jump={session.jump} look={session.look} onExit={() => setSession(null)} />;
}
