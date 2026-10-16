import { describe, expect, it } from 'vitest';
import { clientAddress, ConnectionCounter, originAllowed } from '../connectionGuard';
import { loadConfig, testFlagsSet } from '../config';

describe('originAllowed', () => {
  it('lets the site\'s own pages through, whatever the scheme', () => {
    expect(originAllowed('https://cyberstation.djrecognize.com', 'cyberstation.djrecognize.com', [])).toBe(true);
    expect(originAllowed('http://localhost:3000', 'localhost:3000', [])).toBe(true);
    expect(originAllowed('https://Cyberstation.DJRecognize.com', 'cyberstation.djrecognize.com', [])).toBe(true);
  });

  it('refuses other websites, malformed origins and a missing Host', () => {
    expect(originAllowed('https://evil.example', 'cyberstation.djrecognize.com', [])).toBe(false);
    expect(originAllowed('https://cyberstation.djrecognize.com.evil.example', 'cyberstation.djrecognize.com', [])).toBe(false);
    expect(originAllowed('not a url', 'cyberstation.djrecognize.com', [])).toBe(false);
    expect(originAllowed('https://cyberstation.djrecognize.com', undefined, [])).toBe(false);
  });

  it('lets any localhost page through only while developing (the dev server proxies to another port)', () => {
    expect(originAllowed('http://localhost:3000', 'localhost:8080', [])).toBe(false);
    expect(originAllowed('http://localhost:3000', 'localhost:8080', [], true)).toBe(true);
    expect(originAllowed('http://127.0.0.1:3131', 'localhost:8080', [], true)).toBe(true);
    expect(originAllowed('https://evil.example', 'localhost:8080', [], true)).toBe(false);
    expect(originAllowed('http://localhost.evil.example', 'localhost:8080', [], true)).toBe(false);
  });

  it('allows listed origins, and clients that send no Origin (not a hijacked browser)', () => {
    expect(originAllowed('https://beta.example', 'cyberstation.djrecognize.com', ['https://beta.example'])).toBe(true);
    expect(originAllowed(undefined, 'cyberstation.djrecognize.com', [])).toBe(true);
  });
});

describe('clientAddress', () => {
  const request = (headers: Record<string, string | string[]>) => ({ headers, socket: { remoteAddress: '10.0.0.1' } });

  it('uses the socket peer unless a proxy is trusted', () => {
    expect(clientAddress(request({ 'x-forwarded-for': '1.1.1.1', 'cf-connecting-ip': '2.2.2.2' }), 'off')).toBe('10.0.0.1');
  });

  it('behind Caddy, believes only the first forwarded address (a spoofed Cloudflare header is ignored)', () => {
    expect(clientAddress(request({ 'cf-connecting-ip': '2.2.2.2', 'x-forwarded-for': '1.1.1.1, 10.0.0.9' }), 'forwarded')).toBe('1.1.1.1');
    expect(clientAddress(request({}), 'forwarded')).toBe('10.0.0.1');
  });

  it('behind Cloudflare, prefers its header, then the forwarded address', () => {
    expect(clientAddress(request({ 'cf-connecting-ip': '2.2.2.2', 'x-forwarded-for': '1.1.1.1' }), 'cloudflare')).toBe('2.2.2.2');
    expect(clientAddress(request({ 'x-forwarded-for': '1.1.1.1' }), 'cloudflare')).toBe('1.1.1.1');
  });
});

describe('ConnectionCounter', () => {
  it('caps sockets per address and overall, and frees a place when one closes', () => {
    const counter = new ConnectionCounter(3, 2);
    counter.opened('a');
    counter.opened('a');
    expect(counter.canOpen('a')).toBe(false);
    expect(counter.canOpen('b')).toBe(true);

    counter.opened('b');
    expect(counter.total).toBe(3);
    expect(counter.canOpen('c')).toBe(false);

    counter.closed('a');
    expect(counter.canOpen('a')).toBe(true);
    counter.closed('a');
    counter.closed('a'); // closing more than were opened never goes negative
    expect(counter.total).toBe(1);
  });
});

describe('loadConfig', () => {
  it('defaults to a safe development setup that saves nothing', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ production: false, dataDir: undefined, maxPlayers: 60, blackBoxEnabled: true, trustProxy: 'off' });
  });

  it('turns Black Box recording off in production unless asked for', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).blackBoxEnabled).toBe(false);
    expect(loadConfig({ NODE_ENV: 'production', CELLWARZ_BLACK_BOX: 'on' }).blackBoxEnabled).toBe(true);
    expect(loadConfig({ CELLWARZ_BLACK_BOX: 'off' }).blackBoxEnabled).toBe(false);
  });

  it('reads and sanitizes the environment', () => {
    const config = loadConfig({
      PORT: '9000',
      CELLWARZ_MAX_PLAYERS: '25',
      CELLWARZ_MAX_CONNECTIONS_PER_IP: 'nonsense',
      CELLWARZ_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
      CELLWARZ_TRUST_PROXY: 'cloudflare',
      CELLWARZ_RESERVED_NAMES: 'DJ Recognize, Boss',
      CELLWARZ_SLEEPER_EVICT_MINUTES: '5',
    });
    expect(config.port).toBe(9000);
    expect(config.maxPlayers).toBe(25);
    expect(config.maxConnectionsPerIp).toBe(8);
    expect(config.allowedOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(config.trustProxy).toBe('cloudflare');
    expect(loadConfig({ CELLWARZ_TRUST_PROXY: 'forwarded' }).trustProxy).toBe('forwarded');
    expect(loadConfig({ CELLWARZ_TRUST_PROXY: 'on' }).trustProxy).toBe('forwarded');
    expect(loadConfig({ CELLWARZ_TRUST_PROXY: 'yes please' }).trustProxy).toBe('off');
    expect(config.reservedNames).toEqual(['djrecognize', 'boss']);
    expect(config.sleeperEvictMs).toBe(5 * 60_000);
  });

  it('spots the e2e-only switches', () => {
    expect(testFlagsSet({})).toEqual([]);
    expect(testFlagsSet({ CELLWARZ_ROBOTS: 'off', CELLWARZ_PLANET_PULL: 'off', OTHER: 'x' })).toEqual(['CELLWARZ_PLANET_PULL', 'CELLWARZ_ROBOTS']);
  });
});
