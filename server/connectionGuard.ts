import type { IncomingHttpHeaders } from 'node:http';
import type { ProxyTrust } from './config';

/** The client's address: the real one the trusted proxy (Caddy, or Cloudflare in front of it) reports, otherwise the socket's own peer. */
export function clientAddress(request: { headers: IncomingHttpHeaders; socket: { remoteAddress?: string } }, trustProxy: ProxyTrust): string {
  if (trustProxy === 'cloudflare') {
    const cloudflare = request.headers['cf-connecting-ip'];
    if (typeof cloudflare === 'string' && cloudflare.length > 0) return cloudflare.trim();
  }

  if (trustProxy !== 'off') {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }

  return request.socket.remoteAddress ?? 'unknown';
}

/**
 * Whether a browser page may open a socket: only pages of the server's own site (the Origin names the Host it was
 * opened against) or an explicitly allowed origin. Without this any website could drive a visitor's logged-in game.
 * Clients that send no Origin (scripts, tests) can't be a hijacked browser, so they pass. While developing
 * (`allowLocalhost`) a page on any localhost port passes too: the dev server on :3000 proxies sockets to :8080, which
 * rewrites the Host.
 */
export function originAllowed(origin: string | undefined, host: string | undefined, allowed: readonly string[], allowLocalhost = false): boolean {
  if (origin === undefined) return true;
  if (allowed.includes(origin)) return true;

  try {
    const url = new URL(origin);
    if (allowLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
    return host !== undefined && url.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/** Counts open sockets, overall and per client address, so one visitor can't use up the server. */
export class ConnectionCounter {
  private readonly perAddress = new Map<string, number>();
  private open = 0;

  constructor(
    private readonly maxTotal: number,
    private readonly maxPerAddress: number,
  ) {}

  get total(): number {
    return this.open;
  }

  canOpen(address: string): boolean {
    return this.open < this.maxTotal && (this.perAddress.get(address) ?? 0) < this.maxPerAddress;
  }

  opened(address: string): void {
    this.open++;
    this.perAddress.set(address, (this.perAddress.get(address) ?? 0) + 1);
  }

  closed(address: string): void {
    const count = this.perAddress.get(address) ?? 0;
    if (count === 0) return;

    this.open--;
    const remaining = count - 1;
    if (remaining > 0) this.perAddress.set(address, remaining);
    else this.perAddress.delete(address);
  }
}
