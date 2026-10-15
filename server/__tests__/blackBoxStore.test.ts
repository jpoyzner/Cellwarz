import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { LATEST_BLACK_BOX_FILE, MAX_BLACK_BOX_BYTES, saveLatestBlackBox } from '../blackBoxStore';
import { SocketHub } from '../socketHub';
import type { World } from '../world';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cellwarz-bb-'));
  process.env.CELLWARZ_BLACK_BOX_DIR = dir;
});

afterEach(async () => {
  delete process.env.CELLWARZ_BLACK_BOX_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe('saveLatestBlackBox', () => {
  it('keeps only the latest Black Box: a new one overwrites the old file', async () => {
    await saveLatestBlackBox({ login: 'first' });
    await saveLatestBlackBox({ login: 'second' });

    expect(await readdir(dir)).toEqual([LATEST_BLACK_BOX_FILE]);
    expect(JSON.parse(await readFile(path.join(dir, LATEST_BLACK_BOX_FILE), 'utf8'))).toEqual({ login: 'second' });
  });

  it('refuses an oversized Black Box and leaves the previous one alone', async () => {
    await saveLatestBlackBox({ login: 'kept' });
    const saved = await saveLatestBlackBox({ junk: 'x'.repeat(MAX_BLACK_BOX_BYTES) });

    expect(saved).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(dir, LATEST_BLACK_BOX_FILE), 'utf8'))).toEqual({ login: 'kept' });
  });
});

describe('SocketHub Black Box message', () => {
  function setup(login?: string) {
    const socket = Object.assign(new EventEmitter(), { OPEN: 1, readyState: 1, send: vi.fn() }) as unknown as WebSocket;
    const world = { getZion: () => ({ getHardlines: () => new Map() }) } as unknown as World;
    const hub = new SocketHub(world, socket);
    if (login) hub['login'] = login;
    return socket;
  }

  it('writes a logged-in player\'s Black Box to disk', async () => {
    const socket = setup('recorder');
    socket.emit('message', Buffer.from(JSON.stringify({ blackBox: { login: 'recorder', events: [] } })));

    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(path.join(dir, LATEST_BLACK_BOX_FILE), 'utf8')).login).toBe('recorder');
    });
  });

  it('ignores a Black Box from a connection that never logged in', async () => {
    const socket = setup();
    socket.emit('message', Buffer.from(JSON.stringify({ blackBox: { login: 'ghost' } })));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await readdir(dir)).toEqual([]);
  });
});
