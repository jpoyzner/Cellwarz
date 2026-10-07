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
        backgroundKind: 'space' | 'temple' | undefined;
        score: number;
        spaceBackground?: {
          pieces: TestPiece[];
          shards: unknown[];
        };
      };
    };
  }
}
