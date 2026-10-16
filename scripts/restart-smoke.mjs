// Restart smoke test: proves the real server (not just its parts) brings an account and the room back after a restart.
//
//   npm run test:restart
//
// It starts the server with a throwaway data folder, logs a bot in with a hash, has it score and leave, stops the server
// gracefully (as a deploy does), starts it again on the same folder and checks the account (score, hash) and the bot's
// sleeping avatar are exactly as they were.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 8300 + Math.floor(Math.random() * 500);
const dataDir = mkdtempSync(path.join(tmpdir(), 'cyberstation-smoke-'));
const origin = `http://localhost:${PORT}`;

function startServer() {
  const child = spawn('node_modules/.bin/tsx', ['server.ts'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      CELLWARZ_DATA_DIR: dataDir,
      CELLWARZ_ROBOTS: 'off',
      CELLWARZ_SNAPSHOT_INTERVAL_SECONDS: '1',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  return new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      process.stdout.write(`  [server] ${chunk}`);
      if (chunk.toString().includes('listening')) resolve(child);
    });
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.removeAllListeners('exit');
    child.on('exit', resolve);
    child.kill('SIGTERM');
  });
}

// Logs in and resolves with the full-state payload (or the refusal).
// `jump` = TELEPORT in (a fresh avatar at a random spot); otherwise WAKE UP (re-attach to the avatar the room has).
function login(name, hash, { score, jump = true } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${PORT}/socketrefresh`, { headers: { Origin: origin } });
    socket.on('error', reject);
    socket.on('open', () => socket.send(JSON.stringify({ connect: true, login: name, hash, jump })));
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.connect === undefined) return;
      if (score && message.connect === '0') socket.send(JSON.stringify({ scored: score }));
      setTimeout(() => {
        socket.close();
        resolve(message);
      }, 400);
    });
  });
}

const position = (state, name) => state.sprites[state.avatars[name]]?.slice(1, 3);

let server;
let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  ${detail}`}`);
  if (!ok) failed = true;
};

try {
  console.log('First run:');
  server = await startServer();
  const first = await login('smoke-bot', 'hunter2', { score: 3 });
  const again = await login('smoke-bot', 'hunter2', { jump: false }); // the score report has landed by now; waking up shows it
  check('bot entered the game', first.connect === '0');
  check('bot has its score before the restart', again.score === 60, `score ${again.score}`);
  const before = position(again, 'smoke-bot');
  await new Promise((resolve) => setTimeout(resolve, 1500)); // a snapshot lands every second
  await stopServer(server);

  console.log('Second run (same data folder):');
  server = await startServer();
  const wrong = await login('smoke-bot', 'wrong guess', { jump: false });
  check('a wrong hash is still refused', wrong.connect === 'denied', JSON.stringify(wrong.connect));

  const after = await login('smoke-bot', 'hunter2', { jump: false });
  check('the right hash still works', after.connect === '0', JSON.stringify(after.connect));
  check('the score survived', after.score === 60, `score ${after.score}`);
  const restored = position(after, 'smoke-bot');
  check('the avatar is back where it was', before && restored && Math.abs(before[0] - restored[0]) < 200 && Math.abs(before[1] - restored[1]) < 200, `${before} -> ${restored}`);
  await stopServer(server);
} catch (error) {
  console.error(error);
  failed = true;
  if (server) server.kill('SIGKILL');
} finally {
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(failed ? '\nRestart smoke test FAILED' : '\nRestart smoke test passed');
process.exit(failed ? 1 : 0);
