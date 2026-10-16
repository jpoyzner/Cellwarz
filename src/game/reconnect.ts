/** Delay before reconnect attempt number `attempt` (0-based): doubles from half a second to a ceiling, with jitter so a restarted server isn't hit by every client at once. */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(500 * 2 ** attempt, 10_000);
  return Math.round(base * (0.5 + random() * 0.5));
}

/** How long a dropped connection keeps trying before the player is sent back to the login screen. */
export const RECONNECT_GIVE_UP_MS = 2 * 60_000;
/** A connection that has gone this long without any message is treated as dead (the server sends a frame ~48 times a second). */
export const SILENCE_LIMIT_MS = 10_000;
