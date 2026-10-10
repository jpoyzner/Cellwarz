import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { MainRoom } from '../cell/mainRoom';
import { Engine } from '../engine';
import { Physics } from '../physics';
import { Session } from '../session';
import { Robot } from '../sprite/robot';
import { SocketHub } from '../socketHub';
import type { World } from '../world';

const isPlanetPing = (message: Record<string, unknown>): boolean => Object.keys(message).join() === 'planet';

/** A dead player (or one assimilated by a robot, told what to follow) must keep receiving frames to spectate, not freeze. */
describe('SocketHub for a dead or assimilated player', () => {
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
    hub['login'] = 'borged';

    const avatar = room.addAvatarAtEntrance('borged')!;
    const session = new Session(avatar);
    hardlines.set('borged', session);
    return { room, hub, sent, avatar, session };
  }

  it('sends the death ping, then a full refresh naming the robot to follow, then keeps streaming frames', () => {
    const { room, hub, sent, avatar, session } = setup();
    const body = new Robot(avatar.getX(), avatar.getY(), false, room);
    avatar.die();
    session.setRobotBody(body);

    hub.renderClient();
    const frames = sent.filter((message) => !isPlanetPing(message));
    expect(frames[0]).toEqual({ died: true });
    expect(frames[1].connect).toBe('0');
    expect(frames[1].following).toBe(body.getCellIndex());
    expect(Object.keys(frames[1].avatars as object)).not.toContain('borged');

    sent.length = 0;
    hub.renderClient();
    hub.renderClient();
    const later = sent.filter((message) => !isPlanetPing(message));
    expect(later).toHaveLength(2);
    expect(later.every((message) => !('died' in message) && !('connect' in message))).toBe(true);
  });

  it('keeps streaming to a player who simply died (no robot body): death ping, one full refresh, then frames', () => {
    const { hub, sent, avatar } = setup();
    avatar.die();

    hub.renderClient();
    const first = sent.filter((message) => !isPlanetPing(message));
    expect(first[0]).toEqual({ died: true });
    expect(first[1].connect).toBe('0');
    expect(first[1].following).toBeNull();
    expect(Object.keys(first[1].avatars as object)).not.toContain('borged');

    sent.length = 0;
    hub.renderClient();
    hub.renderClient();
    const later = sent.filter((message) => !isPlanetPing(message));
    expect(later).toHaveLength(2);
    expect(later.every((message) => !('died' in message) && !('connect' in message))).toBe(true);
  });

  it('tells a player idle for too long that they are inactive', () => {
    const { hub, sent } = setup();
    hub['inactivityCount'] = 3000;

    hub.renderClient();

    expect(sent.filter((message) => !isPlanetPing(message))).toEqual([{ connect: 'inactive' }]);
  });

  it('does not follow anything while the player has a live avatar', () => {
    const { hub, sent } = setup();
    hub['handleLogin']({ connect: true, login: 'borged' });

    const full = sent.find((message) => message.connect === '0');
    expect(full?.following).toBeNull();
  });
});
