import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { MainRoom } from '../cell/mainRoom';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Session } from '../session';
import { SocketHub } from '../socketHub';
import type { World } from '../world';

const isPlanetPing = (message: Record<string, unknown>): boolean => Object.keys(message).join() === 'planet';

describe('SocketHub diamonds', () => {
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

    const sent: Array<Record<string, unknown>> = [];
    const socket = Object.assign(new EventEmitter(), {
      OPEN: 1,
      readyState: 1,
      send: (message: string) => sent.push(JSON.parse(message)),
    }) as unknown as WebSocket;
    const hub = new SocketHub(world, socket);
    hub['login'] = 'gemmy';

    const session = new Session(room.addAvatarAtEntrance('gemmy')!);
    hardlines.set('gemmy', session);
    return { hub, sent, session };
  }

  const frames = (sent: Array<Record<string, unknown>>) => sent.filter((message) => !isPlanetPing(message));

  it('tells the client the new total as a one-shot message when diamonds are collected, and only then', () => {
    const { hub, sent, session } = setup();

    hub.renderClient();
    expect(frames(sent).some((message) => 'diamonds' in message)).toBe(false);

    session.addDiamonds(2);
    sent.length = 0;
    hub.renderClient();
    hub.renderClient();

    expect(frames(sent).filter((message) => 'diamonds' in message)).toEqual([{ diamonds: 2 }]);
  });

  it('includes the running total in the full-state payload and no longer sends a tool dashboard', () => {
    const { hub, sent, session } = setup();
    session.addDiamonds(4);

    hub['handleLogin']({ connect: true, login: 'gemmy' });

    const full = sent.find((message) => message.connect === '0')!;
    expect(full.diamonds).toBe(4);
    expect('tools' in full).toBe(false);

    sent.length = 0;
    hub.renderClient();
    expect(frames(sent).some((message) => 'diamonds' in message)).toBe(false);
  });
});
