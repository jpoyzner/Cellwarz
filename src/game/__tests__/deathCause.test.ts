import { describe, expect, it } from 'vitest';
import { describeDeath } from '../deathCause';

describe('describeDeath', () => {
  it('has a card for every cause the server names', () => {
    for (const cause of ['blast', 'rocket', 'star', 'planet']) {
      const card = describeDeath(cause);
      expect(card?.cause).toMatch(/^KILLED BY: /);
      expect(card?.tip.length).toBeGreaterThan(10);
    }
  });

  it('says nothing for a missing or unknown cause', () => {
    expect(describeDeath(undefined)).toBeNull();
    expect(describeDeath('gremlins')).toBeNull();
    expect(describeDeath('toString')).toBeNull();
    expect(describeDeath(7)).toBeNull();
  });
});
