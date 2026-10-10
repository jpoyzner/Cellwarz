export {};

interface TestPiece {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

declare global {
  interface Window {
    /** Scratch slot a spec uses to remember a background piece across evaluate() calls. */
    __target?: TestPiece;
    /** Test-only introspection hook exposed by GameCanvas — public game state only. */
    __cellwarz?: {
      renderer: {
        sprites: Record<string, [number, number, number]>;
        avatars: Record<string, string>;
        looks: Record<string, [string, string]>;
        sleeping: Set<string>;
        backgroundKind: 'space' | 'station' | 'temple' | undefined;
        score: number;
        diamonds: number;
        shownDiamonds: number;
        imagePaths: string[];
        setDiamonds: (diamonds: number) => void;
        render: (data: Record<string, unknown>) => void;
        isMusicPlaying: boolean;
        spectatorMode: 'off' | 'following' | 'free' | 'asleep';
        getPlayerOffset: () => { offsetX: number; offsetY: number; me: [number, number, number] | undefined };
        applyFullState: (data: Record<string, unknown>) => void;
        onLocalAvatarDeath: () => void;
        tvs: Array<{ x: number; y: number; width: number; height: number; chainTopY: number }>;
        tvScreens: { isPlaying: boolean; isShowingAd: boolean; hasSignal: boolean };
        planet?: { x: number; y: number; vx: number; vy: number; radius: number };
        spaceBackground?: {
          pieces: TestPiece[];
          shards: unknown[];
        };
      };
      syncer: { handleMessage: (data: Record<string, unknown>) => void };
    };
    /** Test-only introspection hook exposed by the login screen's ship room — public state only. */
    __cellwarzLogin?: {
      room: {
        avatar: { x: number; y: number; onGround: boolean };
        look: { headband: string; belt: string } | null;
        wakeAvailable: boolean;
        isBeaming: boolean;
      };
      radar: {
        sprites: Record<string, [number, number, number]>;
        hasLivingAvatar: (name: string) => boolean;
        counts: () => { pilots: number; robots: number };
      };
    };
  }
}
