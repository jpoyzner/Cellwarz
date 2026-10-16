export interface LoginThrottleOptions {
  /** How long a failed attempt counts against a client. */
  windowMs?: number;
  /** Failures one address may rack up (across any callsigns) before it is turned away. */
  maxPerAddress?: number;
  /** Failures one address may rack up against one callsign. */
  maxPerCallsign?: number;
  now?: () => number;
}

const DEFAULT_WINDOW_MS = 10 * 60_000;
const SWEEP_ABOVE_KEYS = 5000;

/**
 * Slows down guessing of callsign hashes: too many wrong hashes from one address (overall, or for one callsign) within the
 * window and that address is refused until the oldest failure ages out. Tracked in memory only.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxPerAddress: number;
  private readonly maxPerCallsign: number;
  private readonly now: () => number;

  constructor({ windowMs = DEFAULT_WINDOW_MS, maxPerAddress = 20, maxPerCallsign = 5, now = Date.now }: LoginThrottleOptions = {}) {
    this.windowMs = windowMs;
    this.maxPerAddress = maxPerAddress;
    this.maxPerCallsign = maxPerCallsign;
    this.now = now;
  }

  /** Milliseconds this address must wait before trying `login` again (0 = go ahead). */
  blockedFor(address: string, login: string): number {
    return Math.max(this.waitFor(`a:${address}`, this.maxPerAddress), this.waitFor(`c:${address}|${login}`, this.maxPerCallsign));
  }

  recordFailure(address: string, login: string): void {
    if (this.failures.size > SWEEP_ABOVE_KEYS) this.sweep();
    this.push(`a:${address}`);
    this.push(`c:${address}|${login}`);
  }

  /** A right hash clears that address's record against that callsign. */
  recordSuccess(address: string, login: string): void {
    this.failures.delete(`c:${address}|${login}`);
  }

  private push(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    this.failures.set(key, recent);
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    return (this.failures.get(key) ?? []).filter((at) => at > cutoff);
  }

  private waitFor(key: string, max: number): number {
    const recent = this.recent(key);
    if (recent.length < max) return 0;
    return recent[recent.length - max] + this.windowMs - this.now();
  }

  private sweep(): void {
    for (const key of [...this.failures.keys()]) {
      const recent = this.recent(key);
      if (recent.length === 0) this.failures.delete(key);
      else this.failures.set(key, recent);
    }
  }
}
