import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { loadConfig, testFlagsSet } from './server/config';
import { ConnectionCounter, clientAddress, originAllowed } from './server/connectionGuard';
import { LoginThrottle } from './server/loginThrottle';
import { Persistence } from './server/persistence';
import { SocketHub } from './server/socketHub';
import { createApp } from './server/web';
import { World } from './server/world';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOCKET_PATH = '/socketrefresh';
const HEARTBEAT_MS = 30_000;
// Client messages are a few hundred bytes; only a local Black Box recording is big.
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_BLACK_BOX_MESSAGE_BYTES = 30 * 1024 * 1024;

const config = loadConfig();

// The deterministic-test switches change the game itself; on the real site they would quietly break it.
const flags = testFlagsSet();
if (config.production && flags.length > 0 && process.env.CELLWARZ_ALLOW_TEST_FLAGS !== 'on') {
  console.error(`Refusing to start in production with test-only switches set: ${flags.join(', ')}.`);
  process.exit(1);
}

const persistence = config.dataDir ? new Persistence(config.dataDir) : undefined;
const world = new World({ persistence, config });
const connections = new ConnectionCounter(config.maxConnections, config.maxConnectionsPerIp);
const loginThrottle = new LoginThrottle({ maxPerAddress: config.loginFailuresPerAddress, maxPerCallsign: config.loginFailuresPerCallsign });

const app = createApp({ root: __dirname, config, world, openConnections: () => connections.total });
const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: config.blackBoxEnabled ? MAX_BLACK_BOX_MESSAGE_BYTES : MAX_MESSAGE_BYTES,
  // permessage-deflate is deliberately off: it shrinks frames ~7x, but with it on the browser tests lost or delayed players' key
  // messages (cause not isolated). Revisit with interest management (sending each player only what is near them) instead.
  perMessageDeflate: false,
});

function refuse(socket: import('node:stream').Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname !== SOCKET_PATH) {
    socket.destroy();
    return;
  }

  if (!originAllowed(request.headers.origin, request.headers.host, config.allowedOrigins, !config.production)) {
    refuse(socket, '403 Forbidden');
    return;
  }

  const address = clientAddress(request, config.trustProxy);
  if (!connections.canOpen(address)) {
    refuse(socket, '429 Too Many Requests');
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    connections.opened(address);
    ws.on('close', () => connections.closed(address));
    wss.emit('connection', ws, request, address);
  });
});

// Dead links (a phone that lost signal) are noticed by a missing pong and cleaned up, which puts that avatar to sleep.
const alive = new WeakSet<WebSocket>();
wss.on('connection', (socket: WebSocket, _request: http.IncomingMessage, address: string) => {
  alive.add(socket);
  socket.on('pong', () => alive.add(socket));
  socket.on('error', (e) => console.error(e));
  new SocketHub(world, socket, { config, address, loginThrottle });
});

setInterval(() => {
  for (const socket of wss.clients) {
    if (!alive.has(socket)) {
      socket.terminate();
      continue;
    }
    alive.delete(socket);
    socket.ping();
  }
}, HEARTBEAT_MS).unref();

server.listen(config.port, () => {
  const saving = config.dataDir ? `saving to ${config.dataDir}` : 'not saving (set CELLWARZ_DATA_DIR)';
  console.log(`Cyberstation server listening on http://localhost:${config.port} (${config.production ? 'production' : 'development'}, ${saving})`);
});

let shuttingDown = false;
function shutDown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;

  // Hanging up makes every client reconnect (and find the room as it was) once the server is back.
  for (const socket of wss.clients) socket.close(1001, 'server restarting');
  persistence?.close();
  server.close();
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGTERM', () => shutDown(0));
process.on('SIGINT', () => shutDown(0));
process.on('uncaughtException', (error) => {
  console.error('Fatal error:', error);
  // The room may be in a bad state, so only the accounts are saved; the last good room snapshot is what comes back.
  persistence?.flushUsers();
  process.exit(1);
});
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
