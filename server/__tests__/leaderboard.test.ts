import { describe, expect, it } from 'vitest';
import { topScores } from '../leaderboard';
import type { Session } from '../session';

const sessions = (scores: Record<string, number>) =>
  new Map(Object.entries(scores).map(([name, score]) => [name, { getScore: () => score } as Session]));

describe('topScores', () => {
  it('ranks the three players with the most Disco shards, best first', () => {
    const board = topScores(sessions({ ann: 40, bob: 200, cat: 20, dan: 120, eve: 60 }));
    expect(board).toEqual([
      ['bob', 200],
      ['dan', 120],
      ['eve', 60],
    ]);
  });

  it('leaves out players who have collected none, and is empty when nobody has', () => {
    expect(topScores(sessions({ ann: 0, bob: 20 }))).toEqual([['bob', 20]]);
    expect(topScores(sessions({ ann: 0 }))).toEqual([]);
    expect(topScores(new Map())).toEqual([]);
  });
});
