import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { dumpSprites } from '../blackBoxDump';
import { LATEST_BLACK_BOX_FILE } from '../blackBoxStore';
import { MainRoom } from '../cell/mainRoom';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Session } from '../session';
import { SocketHub } from '../socketHub';
import type { World } from '../world';

describe('Black Box server-side sprite dump', () => {
  const hubs: SocketHub[] = [];
  let dir: string;

  beforeAll(() => {
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
    process.env.CELLWARZ_ROBOTS = 'off';
  });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cellwarz-bb-dump-'));
    process.env.CELLWARZ_BLACK_BOX_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.CELLWARZ_BLACK_BOX_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  afterAll(() => {
    for (const hub of hubs) if (hub['timer']) clearInterval(hub['timer']);
    delete process.env.CELLWARZ_RANDOM_BLOCKS;
    delete process.env.CELLWARZ_ROBOTS;
  });

  function setup() {
    const physics = new Physics();
    const hardlines = new Map<string, Session>();
    const world = {
      getPhysics: () => physics,
      getZion: () => ({
        getHardlines: () => hardlines,
        addSession: (login: string, session: Session) => hardlines.set(login, session),
        isFull: () => false,
        stale: () => false,
        loginNotStale: () => undefined,
        getRandomEngine: () => ({ getCell: () => room }),
      }),
    } as unknown as World;
    const room = new MainRoom(world);
    new Engine(room);
    room.init();

    const socket = Object.assign(new EventEmitter(), { OPEN: 1, readyState: 1, send: () => undefined, close: () => undefined });
    const hub = new SocketHub(world, socket as unknown as WebSocket);
    hubs.push(hub);
    const message = (data: Record<string, unknown>) => socket.emit('message', JSON.stringify(data));
    return { room, message };
  }

  it('dumps every sprite in the room with its real class, size, layer and mass', () => {
    const { room } = setup();
    const dump = dumpSprites(room);

    expect(dump).toHaveLength(room.getCellData().getSprites().length);
    expect(new Set(dump.map((sprite) => sprite.id)).size).toBe(dump.length);
    const types = new Set(dump.map((sprite) => sprite.type));
    expect(types.has('Thruster')).toBe(true);
    expect(dump.every((sprite) => sprite.width > 0 && sprite.height > 0 && typeof sprite.type === 'string')).toBe(true);
  });

  it('includes a coloured block\'s velocity in its dumped state', () => {
    const { room } = setup();
    const block = dumpSprites(room).find((sprite) => sprite.state !== undefined)!;

    expect(block.state).toMatchObject({ vx: 0, vy: expect.any(Number), groupSize: 1 });
  });

  it('saves the start and end sprite dumps next to the client\'s recording', async () => {
    const { room, message } = setup();
    message({ connect: true, login: 'boxer', jump: true });
    message({ blackBoxStarted: true });
    message({ blackBox: { login: 'boxer', events: [] } });

    const file = path.join(dir, LATEST_BLACK_BOX_FILE);
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(file, 'utf8')).login).toBe('boxer');
    });
    const saved = JSON.parse(await readFile(file, 'utf8'));

    expect(saved.server.startSprites).toHaveLength(room.getCellData().getSprites().length);
    expect(saved.server.endSprites).toHaveLength(room.getCellData().getSprites().length);
    expect(saved.server.startSprites.some((sprite: { type: string }) => sprite.type === 'Avatar')).toBe(true);
  });
});
