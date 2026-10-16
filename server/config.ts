import path from 'node:path';
import { normalizeCallsign } from './callsign';

/** Every knob of the deployed server, read once from the environment (see .env.example and DEPLOY.md). */
export type ProxyTrust = 'off' | 'forwarded' | 'cloudflare';

export interface ServerConfig {
  port: number;
  production: boolean;
  /** Where the user database and room snapshots live; undefined = nothing is saved (the dev and e2e default). */
  dataDir: string | undefined;
  /** How many players can be connected at once; more get "Station is at capacity". */
  maxPlayers: number;
  /** Open sockets (game and login-screen radar) allowed in total and per client address. */
  maxConnections: number;
  maxConnectionsPerIp: number;
  /** Extra browser origins allowed to open a socket (the page's own origin always is). */
  allowedOrigins: string[];
  /**
   * Which header to believe for the real client address: 'forwarded' = Caddy's X-Forwarded-For (it overwrites what clients
   * send), 'cloudflare' = Cloudflare's CF-Connecting-IP (only safe when the server is reachable solely through Cloudflare),
   * 'off' = the socket's own peer.
   */
  trustProxy: ProxyTrust;
  /** Black Box recording is a local development tool; it is off on the real site. */
  blackBoxEnabled: boolean;
  snapshotIntervalMs: number;
  /** A sleeping avatar is removed from the room after this long (its player's account and score stay). */
  sleeperEvictMs: number;
  /** Wrong hashes one address may try (overall / against one callsign) per ten minutes before it is turned away. */
  loginFailuresPerAddress: number;
  loginFailuresPerCallsign: number;
  /** Callsigns nobody can claim (compared ignoring case and punctuation). */
  reservedNames: string[];
  /** Origin allowed to read /api/status from a browser (the DJ Recognize site). */
  statusOrigin: string | undefined;
}

export const DEFAULT_RESERVED_NAMES = ['djrecognize', 'admin', 'administrator', 'moderator', 'system', 'server', 'cyberstation', 'robot'];

/** Switches that change the game for the deterministic e2e run; they must never be set on the real site. */
export const TEST_ONLY_FLAGS = ['CELLWARZ_PLANET_PULL', 'CELLWARZ_ROBOTS', 'CELLWARZ_RANDOM_BLOCKS', 'CELLWARZ_RANDOM_TELEPORT'];

const MINUTE_MS = 60_000;

function integer(value: string | undefined, fallback: number, min = 0): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function proxyTrust(value: string | undefined): ProxyTrust {
  if (value === 'cloudflare') return 'cloudflare';
  return value === 'forwarded' || value === 'on' ? 'forwarded' : 'off';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const dataDir = env.CELLWARZ_DATA_DIR ? path.resolve(env.CELLWARZ_DATA_DIR) : undefined;
  const maxPlayers = integer(env.CELLWARZ_MAX_PLAYERS, 60, 1);

  return {
    port: integer(env.PORT, 8080, 1),
    production,
    dataDir,
    maxPlayers,
    maxConnections: integer(env.CELLWARZ_MAX_CONNECTIONS, maxPlayers * 4, 1),
    maxConnectionsPerIp: integer(env.CELLWARZ_MAX_CONNECTIONS_PER_IP, 8, 1),
    allowedOrigins: list(env.CELLWARZ_ALLOWED_ORIGINS),
    trustProxy: proxyTrust(env.CELLWARZ_TRUST_PROXY),
    blackBoxEnabled: env.CELLWARZ_BLACK_BOX ? env.CELLWARZ_BLACK_BOX === 'on' : !production,
    snapshotIntervalMs: integer(env.CELLWARZ_SNAPSHOT_INTERVAL_SECONDS, 10, 1) * 1000,
    sleeperEvictMs: integer(env.CELLWARZ_SLEEPER_EVICT_MINUTES, 30, 1) * MINUTE_MS,
    loginFailuresPerAddress: integer(env.CELLWARZ_LOGIN_FAILURES_PER_ADDRESS, 20, 1),
    loginFailuresPerCallsign: integer(env.CELLWARZ_LOGIN_FAILURES_PER_CALLSIGN, 5, 1),
    reservedNames: (env.CELLWARZ_RESERVED_NAMES !== undefined ? list(env.CELLWARZ_RESERVED_NAMES) : DEFAULT_RESERVED_NAMES).map(normalizeCallsign),
    statusOrigin: env.CELLWARZ_STATUS_ORIGIN || undefined,
  };
}

/** The test-only switches set in `env`; a production server refuses to start with any (unless explicitly allowed). */
export function testFlagsSet(env: NodeJS.ProcessEnv = process.env): string[] {
  return TEST_ONLY_FLAGS.filter((flag) => env[flag] !== undefined);
}

/** The permissive settings a bare `World`/`SocketHub` (unit tests, local scripts) runs with. */
export function defaultConfig(): ServerConfig {
  return loadConfig({});
}
