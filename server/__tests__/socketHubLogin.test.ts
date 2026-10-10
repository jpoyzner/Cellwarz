import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { MainRoom } from '../cell/mainRoom';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Session } from '../session';
import { SocketHub } from '../socketHub';
import type { World } from '../world';

const isPlanetPing = (message: Record<string, unknown>): boolean => Object.keys(message).join() === 'planet';

describe('SocketHub login room connections', () => {
  const hubs: SocketHub[] = [];

  beforeAll(() => {
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
    process.env.CELLWARZ_ROBOTS = 'off';
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
        stale: () => false,
        loginNotStale: () => undefined,
        getRandomEngine: () => ({ getCell: () => room }),
      }),
    } as unknown as World;
    const room = new MainRoom(world);
    new Engine(room);
    room.init();

    function connect() {
      const sent: Array<Record<string, unknown>> = [];
      const socket = Object.assign(new EventEmitter(), {
        OPEN: 1,
        readyState: 1,
        send: (message: string) => sent.push(JSON.parse(message)),
      }) as unknown as WebSocket;
      const hub = new SocketHub(world, socket);
      hubs.push(hub);
      return { hub, sent, message: (data: Record<string, unknown>) => socket.emit('message', JSON.stringify(data)) };
    }

    return { room, hardlines, connect };
  }

  it('lets a login-screen connection spectate the room: full state, then frames, and no avatar or session is made', () => {
    const { hardlines, connect } = setup();
    const { hub, sent, message } = connect();

    message({ connect: true, spectate: true });

    const full = sent.find((payload) => payload.connect === '0')!;
    expect(Object.keys(full.sprites as object).length).toBeGreaterThan(100);
    expect(full.avatars).toEqual({});
    expect(full.score).toBe(0);
    expect(hardlines.size).toBe(0);

    sent.length = 0;
    hub.renderClient();
    const frames = sent.filter((payload) => !isPlanetPing(payload));
    expect(frames).toHaveLength(1);
    expect('connect' in frames[0]).toBe(false);
    expect(hardlines.size).toBe(0);
  });

  it('shows a spectator the avatars that are in the room, so the radar can tell who is awake', () => {
    const { connect } = setup();
    const player = connect();
    player.message({ connect: true, login: 'seen', jump: true });
    const watcher = connect();

    watcher.message({ connect: true, spectate: true });

    const full = watcher.sent.find((payload) => payload.connect === '0')!;
    expect(Object.keys(full.avatars as object)).toEqual(['seen']);
  });

  it('teleports a new login onto a random floor spot, stores its colours and tells everyone', () => {
    const { hardlines, room, connect } = setup();
    const player = connect();
    const other = connect();
    other.message({ connect: true, login: 'bystander', jump: true });
    other.sent.length = 0;

    player.message({ connect: true, login: 'dandy', jump: true, headband: '#00F6FF', belt: '#b45cff' });

    const session = hardlines.get('dandy')!;
    expect(session.getLook()).toEqual({ headband: '#00f6ff', belt: '#b45cff' });
    expect(session.getAvatar()!.getCell()).toBe(room);

    const full = player.sent.find((payload) => payload.connect === '0')!;
    expect(full.looks).toEqual({ dandy: ['#00f6ff', '#b45cff'] });

    // Other players hear it once, as a one-shot message (the redraw frames stay terse).
    other.hub.renderClient();
    other.hub.renderClient();
    expect(other.sent.filter((payload) => 'looks' in payload)).toEqual([{ looks: { dandy: ['#00f6ff', '#b45cff'] } }]);
  });

  it('ignores robot-red or malformed colours, and a later login without colours goes back to the defaults', () => {
    const { hardlines, connect } = setup();
    const player = connect();

    player.message({ connect: true, login: 'redhead', jump: true, headband: '#ff2040', belt: '#00f6ff' });
    expect(hardlines.get('redhead')!.getLook()).toBeUndefined();

    player.message({ connect: true, login: 'redhead', headband: '#00f6ff', belt: '#3cff7a' });
    expect(hardlines.get('redhead')!.getLook()).toEqual({ headband: '#00f6ff', belt: '#3cff7a' });

    connect().message({ connect: true, login: 'redhead', jump: false });
    expect(hardlines.get('redhead')!.getLook()).toBeUndefined();
  });

  it('keeps the existing avatar on a wake-up (no jump) and replaces it on a teleport (jump)', () => {
    const { hardlines, connect } = setup();
    connect().message({ connect: true, login: 'sleeper', jump: true });
    const original = hardlines.get('sleeper')!.getAvatar()!;

    connect().message({ connect: true, login: 'sleeper', jump: false });
    expect(hardlines.get('sleeper')!.getAvatar()).toBe(original);

    connect().message({ connect: true, login: 'sleeper', jump: true });
    expect(hardlines.get('sleeper')!.getAvatar()).not.toBe(original);
    expect(original.removed()).toBe(true);
  });
});
