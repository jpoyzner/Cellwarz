import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { MainRoom } from '../cell/mainRoom';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Session } from '../session';
import { SocketHub } from '../socketHub';
import type { World } from '../world';

describe('SocketHub planet', () => {
  it('tells the client once when the planet leaves for its break, then again when a new one arrives', () => {
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

    const sent: Array<Record<string, unknown>> = [];
    const socket = Object.assign(new EventEmitter(), {
      OPEN: 1,
      readyState: 1,
      send: (message: string) => sent.push(JSON.parse(message)),
    }) as unknown as WebSocket;
    const hub = new SocketHub(world, socket);
    hub['login'] = 'stargazer';
    hardlines.set('stargazer', new Session(room.addAvatarAtEntrance('stargazer')!));

    const planetMessages = () => sent.filter((message) => Object.keys(message).join() === 'planet');
    const field = room['planets']!;

    hub.renderClient();
    expect(planetMessages().map((message) => (message.planet as { id: number } | null)?.id)).toEqual([1]);

    const state = field.getState()!;
    Object.assign(field['planet'], { x: 1e9, vx: Math.abs(state.vx) });
    field.step();
    hub.renderClient();
    hub.renderClient();
    expect(planetMessages().slice(1)).toEqual([{ planet: null }]);

    field['restFramesRemaining'] = 1;
    field.step();
    hub.renderClient();
    expect(planetMessages().map((message) => (message.planet as { id: number } | null)?.id)).toEqual([1, undefined, 2]);
  });
});
