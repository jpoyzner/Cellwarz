import { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { LoginScreen } from './components/LoginScreen';

interface Session {
  loginName: string;
  jump: boolean;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  if (!session) {
    return <LoginScreen onEnter={(loginName, jump) => setSession({ loginName, jump })} />;
  }

  return <GameCanvas loginName={session.loginName} jump={session.jump} onExit={() => setSession(null)} />;
}
