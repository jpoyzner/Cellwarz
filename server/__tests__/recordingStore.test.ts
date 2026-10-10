import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { LATEST_RECORDING_FILE, MAX_RECORDING_BYTES, saveLatestRecording } from '../recordingStore';
import { SocketHub } from '../socketHub';
import type { World } from '../world';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cellwarz-rec-'));
  process.env.CELLWARZ_RECORDINGS_DIR = dir;
});

afterEach(async () => {
  delete process.env.CELLWARZ_RECORDINGS_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('saveLatestRecording', () => {
  it('keeps only the latest recording: a new one overwrites the old file', async () => {
    await saveLatestRecording({ login: 'first' });
    await saveLatestRecording({ login: 'second' });

    expect(await readdir(dir)).toEqual([LATEST_RECORDING_FILE]);
    expect(JSON.parse(await readFile(path.join(dir, LATEST_RECORDING_FILE), 'utf8'))).toEqual({ login: 'second' });
  });

  it('refuses an oversized recording and leaves the previous one alone', async () => {
    await saveLatestRecording({ login: 'kept' });
    const saved = await saveLatestRecording({ junk: 'x'.repeat(MAX_RECORDING_BYTES) });

    expect(saved).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(dir, LATEST_RECORDING_FILE), 'utf8'))).toEqual({ login: 'kept' });
  });
});

describe('SocketHub recording message', () => {
  function setup(login?: string) {
    const socket = Object.assign(new EventEmitter(), { OPEN: 1, readyState: 1, send: vi.fn() }) as unknown as WebSocket;
    const hub = new SocketHub({} as World, socket);
    if (login) hub['login'] = login;
    return socket;
  }

  it('writes a logged-in player\'s recording to disk', async () => {
    const socket = setup('recorder');
    socket.emit('message', Buffer.from(JSON.stringify({ recording: { login: 'recorder', events: [] } })));

    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(path.join(dir, LATEST_RECORDING_FILE), 'utf8')).login).toBe('recorder');
    });
  });

  it('ignores a recording from a connection that never logged in', async () => {
    const socket = setup();
    socket.emit('message', Buffer.from(JSON.stringify({ recording: { login: 'ghost' } })));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await readdir(dir)).toEqual([]);
  });
});
