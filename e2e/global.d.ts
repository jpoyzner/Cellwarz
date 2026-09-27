export {};

declare global {
  interface Window {
    /** Test-only introspection hook exposed by GameCanvas — public game state only. */
    __cellwarz?: {
      renderer: {
        sprites: Record<string, [number, number, number]>;
        avatars: Record<string, string>;
      };
    };
  }
}
