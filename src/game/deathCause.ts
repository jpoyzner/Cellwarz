/** Mirrors server/deathCause.ts. */
export type DeathCause = 'blast' | 'rocket' | 'star' | 'planet';

export interface DeathCard {
  cause: string;
  tip: string;
}

const DEATH_CARDS: Record<DeathCause, DeathCard> = {
  blast: {
    cause: 'KILLED BY: RED BLOCK BLAST',
    tip: 'A RED BLOCK EXPLODES 5 SECONDS AFTER IT IS TOUCHED \u00B7 THROW IT AWAY OR STAND IN A GREEN BUBBLE',
  },
  rocket: {
    cause: 'KILLED BY: ROBOT ROCKET',
    tip: '5 ROCKET OR STAR HITS KILL \u00B7 BREAK LINE OF SIGHT OR STAND IN A GREEN BUBBLE',
  },
  star: {
    cause: 'KILLED BY: NINJA STAR',
    tip: '5 STAR OR ROCKET HITS KILL \u00B7 SHIFT THROWS ONE OF YOUR OWN',
  },
  planet: {
    cause: 'KILLED BY: THE GAS GIANT',
    tip: 'ITS PULL GROWS NEAR THE CORE \u00B7 KEEP YOUR DISTANCE',
  },
};

/** What to tell a player who died of `cause`; null for causes the server doesn't name (or a future one this client lacks). */
export function describeDeath(cause: unknown): DeathCard | null {
  return typeof cause === 'string' && Object.hasOwn(DEATH_CARDS, cause) ? DEATH_CARDS[cause as DeathCause] : null;
}
