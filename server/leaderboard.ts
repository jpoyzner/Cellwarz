import type { Session } from './session';

export const LEADERBOARD_SIZE = 3;

/** `[callsign, Disco shards]`, as sent on the wire. */
export type LeaderboardEntry = [string, number];

/** The players with the most Disco shards (highest first); players with none yet aren't ranked. */
export function topScores(sessions: Map<string, Session>, size = LEADERBOARD_SIZE): LeaderboardEntry[] {
  return [...sessions]
    .map(([name, session]): LeaderboardEntry => [name, session.getScore()])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, size);
}
