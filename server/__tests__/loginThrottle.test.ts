import { describe, expect, it } from 'vitest';
import { LoginThrottle } from '../loginThrottle';
import { TokenBucket } from '../rateLimit';

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('LoginThrottle', () => {
  it('turns an address away after too many wrong hashes for one callsign, until they age out', () => {
    const time = clock();
    const throttle = new LoginThrottle({ windowMs: 600_000, maxPerCallsign: 3, maxPerAddress: 50, now: time.now });
    for (let i = 0; i < 3; i++) {
      expect(throttle.blockedFor('1.2.3.4', 'neo')).toBe(0);
      throttle.recordFailure('1.2.3.4', 'neo');
      time.advance(1000);
    }

    expect(throttle.blockedFor('1.2.3.4', 'neo')).toBeGreaterThan(0);
    expect(throttle.blockedFor('1.2.3.4', 'trinity')).toBe(0);
    expect(throttle.blockedFor('5.6.7.8', 'neo')).toBe(0);

    time.advance(600_000);
    expect(throttle.blockedFor('1.2.3.4', 'neo')).toBe(0);
  });

  it('limits an address that guesses across many callsigns', () => {
    const throttle = new LoginThrottle({ maxPerAddress: 4, maxPerCallsign: 100 });
    for (let i = 0; i < 4; i++) throttle.recordFailure('9.9.9.9', `name${i}`);
    expect(throttle.blockedFor('9.9.9.9', 'brand-new')).toBeGreaterThan(0);
    expect(throttle.blockedFor('8.8.8.8', 'brand-new')).toBe(0);
  });

  it('forgives a callsign after the right hash, and reports how long to wait', () => {
    const time = clock();
    const throttle = new LoginThrottle({ windowMs: 60_000, maxPerCallsign: 2, now: time.now });
    throttle.recordFailure('a', 'neo');
    throttle.recordSuccess('a', 'neo');
    throttle.recordFailure('a', 'neo');
    expect(throttle.blockedFor('a', 'neo')).toBe(0);

    throttle.recordFailure('a', 'neo');
    expect(throttle.blockedFor('a', 'neo')).toBe(60_000);
  });
});

describe('TokenBucket', () => {
  it('allows a burst, then only the refill rate', () => {
    const time = clock();
    const bucket = new TokenBucket(5, 10, time.now);
    for (let i = 0; i < 5; i++) expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);

    time.advance(200); // two tokens back
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });

  it('never holds more than its capacity', () => {
    const time = clock();
    const bucket = new TokenBucket(3, 100, time.now);
    time.advance(60_000);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);
  });
});
