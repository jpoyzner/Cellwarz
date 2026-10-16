// Load test: connects many bots to a running Cyberstation server and has them run, jump and shatter blocks like players,
// then reports how the server held up (message rate, frame gaps, refusals) plus its own /healthz numbers.
//
//   npm run loadtest -- --url http://localhost:8080 --bots 60 --seconds 30
//
// All bots share this machine's address, so start the server with a high CELLWARZ_MAX_CONNECTIONS_PER_IP (and
// CELLWARZ_MAX_PLAYERS at least as high as --bots). Never point this at the real site without telling yourself first.

import WebSocket from 'ws';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

const baseUrl = new URL(option('url', 'http://localhost:8080'));
const botCount = Number(option('bots', '50'));
const seconds = Number(option('seconds', '30'));
const rampMs = Number(option('ramp', '100'));
const wsUrl = `${baseUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${baseUrl.host}/socketrefresh`;

const KEYS = { left: 37, up: 38, right: 39, space: 32 };

const stats = { connected: 0, refused: {}, closed: 0, messages: 0, bytes: 0, errors: 0 };
const gaps = [];
const bots = [];

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function startBot(index) {
  const login = `loadbot-${index}`;
  const socket = new WebSocket(wsUrl, { headers: { Origin: baseUrl.origin } });
  const bot = { socket, timer: undefined, lastMessageAt: 0, running: undefined };
  bots.push(bot);

  const send = (payload) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };

  socket.on('open', () => send({ connect: true, login, hash: '', jump: true }));
  socket.on('message', (data) => {
    const text = data.toString();
    const now = Date.now();
    stats.messages++;
    stats.bytes += text.length;

    const message = JSON.parse(text);
    if (message.connect !== undefined && message.connect !== '0') {
      stats.refused[message.connect] = (stats.refused[message.connect] ?? 0) + 1;
      return;
    }
    if (message.connect === '0' && !bot.timer) {
      stats.connected++;
      bot.timer = setInterval(() => act(bot, send), 120 + Math.random() * 200);
    }
    if (bot.lastMessageAt) gaps.push(now - bot.lastMessageAt);
    bot.lastMessageAt = now;
  });
  socket.on('error', () => stats.errors++);
  socket.on('close', () => {
    stats.closed++;
    if (bot.timer) clearInterval(bot.timer);
  });
}

// Each tick a bot changes what it is doing: running one way, hopping, or grabbing/throwing, like a person would.
function act(bot, send) {
  const roll = Math.random();
  if (bot.running !== undefined) {
    send({ key: bot.running, down: false });
    bot.running = undefined;
  }

  if (roll < 0.4) {
    bot.running = Math.random() < 0.5 ? KEYS.left : KEYS.right;
    send({ key: bot.running, down: true });
  } else if (roll < 0.6) {
    send({ key: KEYS.up, down: true });
    setTimeout(() => send({ key: KEYS.up, down: false }), 150 + Math.random() * 300);
  } else if (roll < 0.7) {
    send({ key: KEYS.space, down: true });
    send({ key: KEYS.space, down: false });
  } else if (roll < 0.75) {
    send({ scored: 1 + Math.floor(Math.random() * 4) });
  }
}

async function health() {
  try {
    const response = await fetch(new URL('/healthz', baseUrl));
    return await response.json();
  } catch {
    return undefined;
  }
}

console.log(`Connecting ${botCount} bots to ${wsUrl} for ${seconds}s...`);
for (let i = 0; i < botCount; i++) {
  startBot(i);
  await new Promise((resolve) => setTimeout(resolve, rampMs));
}

const startedAt = Date.now();
const report = setInterval(async () => {
  const elapsed = (Date.now() - startedAt) / 1000;
  const status = await health();
  console.log(
    `${elapsed.toFixed(0)}s  in-game ${stats.connected - stats.closed}/${botCount}  ` +
      `${Math.round(stats.messages / Math.max(elapsed, 1))} msg/s  gap p95 ${percentile(gaps, 95)}ms  ` +
      `server step avg ${status?.stepAverageMs ?? '?'}ms (budget ${status?.stepBudgetMs ?? '?'}ms)  loop delay p99 ${status?.eventLoopDelayP99Ms ?? '?'}ms`,
  );
}, 5000);

await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
clearInterval(report);

const finalStatus = await health();
// What actually crossed the network (after any compression), as the sockets saw it.
const wireBytes = bots.reduce((sum, bot) => sum + (bot.socket._socket?.bytesRead ?? 0), 0);
for (const bot of bots) {
  if (bot.timer) clearInterval(bot.timer);
  bot.socket.close();
}

const totalSeconds = (Date.now() - startedAt) / 1000;
console.log('\n--- Load test summary ---');
console.log(`bots reaching the game: ${stats.connected}/${botCount}   refused: ${JSON.stringify(stats.refused)}   socket errors: ${stats.errors}`);
console.log(`received: ${Math.round(stats.messages / totalSeconds)} msg/s, ${(stats.bytes / totalSeconds / 1024).toFixed(0)} KiB/s of frames across all bots`);
console.log(`on the wire: ${(wireBytes / totalSeconds / 1024).toFixed(0)} KiB/s across all bots (${(wireBytes / totalSeconds / 1024 / Math.max(stats.connected, 1)).toFixed(1)} KiB/s per player)`);
console.log(`gap between frames per bot: p50 ${percentile(gaps, 50)}ms  p95 ${percentile(gaps, 95)}ms  p99 ${percentile(gaps, 99)}ms  max ${gaps.reduce((max, gap) => Math.max(max, gap), 0)}ms (a frame is due every ~21ms)`);
console.log(`server: ${JSON.stringify(finalStatus)}`);
process.exit(0);
