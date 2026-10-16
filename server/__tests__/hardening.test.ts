import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { defaultConfig } from '../config';
import type { ServerConfig } from '../config';
import { LoginThrottle } from '../loginThrottle';
import { SocketHub } from '../socketHub';
import { World } from '../world';

describe('a shared station under real-world rules', () => {
  const hubs: SocketHub[] = [];

  beforeAll(() => {
    process.env.CELLWARZ_ROBOTS = 'off';
    process.env.CELLWARZ_RANDOM_BLOCKS = 'off';
  });

  afterAll(() => {
    delete process.env.CELLWARZ_ROBOTS;
    delete process.env.CELLWARZ_RANDOM_BLOCKS;
  });

  afterEach(() => {
    for (const hub of hubs.splice(0)) if (hub['timer']) clearInterval(hub['timer']);
  });

  function station(overrides: Partial<ServerConfig> = {}, loginThrottle = new LoginThrottle()) {
    const config = { ...defaultConfig(), ...overrides };
    const world = new World({ config });

    function connect(address = 'visitor') {
      const sent: Array<Record<string, unknown>> = [];
      const closes: Array<number | undefined> = [];
      const socket = Object.assign(new EventEmitter(), {
        OPEN: 1,
        readyState: 1,
        send: (message: string) => sent.push(JSON.parse(message)),
        close: (code?: number) => closes.push(code),
      }) as unknown as WebSocket;
      const hub = new SocketHub(world, socket, { config, address, loginThrottle });
      hubs.push(hub);
      const say = (data: unknown) => socket.emit('message', JSON.stringify(data));
      const login = (name: string, hash = '') => say({ connect: true, login: name, hash, jump: true });
      const leave = () => socket.emit('close');
      const refusal = () => sent.find((m) => typeof m.connect === 'string' && m.connect !== '0')?.connect;
      const entered = () => sent.some((m) => m.connect === '0');
      return { say, login, leave, sent, closes, refusal, entered };
    }

    return { world, zion: world.getZion(), config, connect };
  }

  describe('capacity', () => {
    it('turns a newcomer away with "full" once the station holds as many players as allowed', () => {
      const { connect, zion } = station({ maxPlayers: 2 });
      const [a, b, c] = [connect(), connect(), connect()];
      a.login('alpha');
      b.login('bravo');
      c.login('charlie');

      expect(a.entered() && b.entered()).toBe(true);
      expect(c.refusal()).toBe('full');
      expect(c.closes).toHaveLength(1);
      expect(zion.connectedPlayers()).toBe(2);
      expect(zion.getHardlines().has('charlie')).toBe(false);
    });

    it('lets a connected player log in again (it displaces the old connection) and makes room when someone leaves', () => {
      const { connect } = station({ maxPlayers: 2 });
      const [a, b] = [connect(), connect()];
      a.login('alpha');
      b.login('bravo');

      const again = connect();
      again.login('alpha');
      expect(again.entered()).toBe(true);
      expect(a.refusal()).toBe('displaced');

      b.leave();
      const late = connect();
      late.login('charlie');
      expect(late.entered()).toBe(true);
    });

    it('does not count sleeping avatars with no connection', () => {
      const { connect, zion } = station({ maxPlayers: 1 });
      const a = connect();
      a.login('alpha');
      a.leave();
      expect(zion.connectedPlayers()).toBe(0);

      const b = connect();
      b.login('bravo');
      expect(b.entered()).toBe(true);
    });
  });

  describe('sleeping avatars', () => {
    it('are removed from the room after the allowed time without a connection, but the account stays', () => {
      const { connect, zion } = station({ sleeperEvictMs: 60_000 });
      const a = connect();
      a.login('alpha');
      zion.getHardlines().get('alpha')!.addBlocks(2);
      a.leave();

      const avatar = zion.getHardlines().get('alpha')!.getAvatar()!;
      expect(avatar.isSleeping()).toBe(true);
      const sleptAt = avatar.getSleepingSince();

      expect(zion.evictSleepers(sleptAt + 59_000)).toBe(0);
      expect(zion.evictSleepers(sleptAt + 61_000)).toBe(1);
      expect(avatar.removed()).toBe(true);
      const session = zion.getHardlines().get('alpha')!;
      expect(session.unplugged()).toBe(true);
      expect(session.getScore()).toBe(40);
    });

    it('are never removed while their player is still connected (spectating after Escape)', () => {
      const { connect, zion } = station({ sleeperEvictMs: 1 });
      const a = connect();
      a.login('alpha');
      zion.getHardlines().get('alpha')!.getAvatar()!.fallAsleep();
      expect(zion.evictSleepers(Date.now() + 1_000_000)).toBe(0);
    });
  });

  describe('logging in', () => {
    it('refuses callsigns that are malformed or reserved, without creating an account', () => {
      const { connect, zion } = station();
      const reasons = new Map<unknown, unknown>();
      for (const name of ['', ' padded ', '<script>', 'x'.repeat(33), 'DJ Recognize', 42, null]) {
        const visitor = connect();
        visitor.login(name as string);
        reasons.set(name, visitor.refusal());
      }

      expect([...reasons.values()]).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'reserved', 'invalid', 'invalid']);
      expect(zion.getHardlines().size).toBe(0);
    });

    it('slows down hash guessing: after enough wrong hashes the address is throttled, even for the right hash', () => {
      const { connect } = station({}, new LoginThrottle({ maxPerCallsign: 3 }));
      connect().login('target', 'correct');

      for (let i = 0; i < 3; i++) {
        const guess = connect('attacker');
        guess.login('target', `guess${i}`);
        expect(guess.refusal()).toBe('denied');
      }

      const blocked = connect('attacker');
      blocked.login('target', 'correct');
      expect(blocked.refusal()).toBe('throttled');

      const owner = connect('someone-else');
      owner.login('target', 'correct');
      expect(owner.entered()).toBe(true);
    });

    it('survives garbage messages and a flood without taking anyone else down', () => {
      const { connect } = station();
      const flooder = connect();
      flooder.say([1, 2, 3]);
      flooder.say('"just a string"');
      flooder.say(null);
      flooder.login('flooder');
      expect(flooder.entered()).toBe(true);

      for (let i = 0; i < 2000; i++) flooder.say({ key: 37, down: true });
      expect(flooder.closes).toContain(1008);

      const bystander = connect();
      bystander.login('bystander');
      expect(bystander.entered()).toBe(true);
    });

    it('ignores key messages whose key is not a number', () => {
      const { connect } = station();
      const player = connect();
      player.login('typist');
      expect(() => player.say({ key: { evil: true }, down: true })).not.toThrow();
    });
  });

  describe('score reports', () => {
    it('can not be spammed faster than a person could earn points', () => {
      const { connect, zion } = station();
      const player = connect();
      player.login('cheater');
      for (let i = 0; i < 50; i++) player.say({ scored: 100 });

      const score = zion.getHardlines().get('cheater')!.getScore();
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(60 * 20 + 20); // the burst allowance (plus a moment's refill)
    });
  });

  describe('Black Box recording', () => {
    let dir: string | undefined;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
      delete process.env.CELLWARZ_BLACK_BOX_DIR;
    });

    function recordOn(blackBoxEnabled: boolean) {
      dir = mkdtempSync(path.join(tmpdir(), 'cyberstation-bb-'));
      process.env.CELLWARZ_BLACK_BOX_DIR = dir;
      const { connect } = station({ blackBoxEnabled });
      const player = connect();
      player.login('recorder');
      player.say({ blackBoxStarted: true });
      player.say({ blackBox: { login: 'recorder', events: [] } });
      return { player, file: path.join(dir, 'latest.json') };
    }

    it('is refused on the real site: the server says so and writes nothing', async () => {
      const { player, file } = recordOn(false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(player.sent.find((m) => m.connect === '0')?.blackBox).toBe(false);
      expect(existsSync(file)).toBe(false);
    });

    it('works when developing locally', async () => {
      const { player, file } = recordOn(true);
      expect(player.sent.find((m) => m.connect === '0')?.blackBox).toBe(true);
      await vi.waitFor(() => expect(existsSync(file)).toBe(true), { timeout: 2000 });
    });
  });
});
