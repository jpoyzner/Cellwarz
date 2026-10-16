import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import type { ServerConfig } from '../config';
import { Persistence, SNAPSHOT_FILE, SNAPSHOT_PREVIOUS_FILE } from '../persistence';
import { captureSnapshot, SNAPSHOT_VERSION, validateSnapshot } from '../roomSnapshot';
import type { RoomSnapshot } from '../roomSnapshot';
import { parseLook } from '../look';
import { Session } from '../session';
import { Avatar } from '../sprite/avatar';
import { Robot } from '../sprite/robot';
import { UserStore } from '../userStore';
import { World } from '../world';

const SIZE = { width: 4000, height: 2000 };

function snapshotOf(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { version: SNAPSHOT_VERSION, savedAt: '2026-01-01T00:00:00.000Z', ...SIZE, blocks: [], robots: [], diamonds: [], players: [], ...overrides };
}

describe('UserStore', () => {
  it('saves and loads accounts, updating one that already exists', () => {
    const store = new UserStore(':memory:');
    const user = { login: 'neo', salt: Buffer.from([1, 2, 3]), digest: Buffer.from([4, 5]), kdf: 'scrypt1', score: 40, diamonds: 2, headband: '#00ff00', belt: null };
    store.saveAll([user, { ...user, login: 'trinity', salt: null, digest: null, kdf: null }]);
    store.saveAll([{ ...user, score: 100 }]);

    const loaded = store.loadAll().sort((a, b) => a.login.localeCompare(b.login));
    expect(loaded.map((u) => [u.login, u.score])).toEqual([['neo', 100], ['trinity', 40]]);
    expect(Buffer.from(loaded[0].salt!)).toEqual(Buffer.from([1, 2, 3]));
    expect(loaded[1].salt).toBeNull();
    expect(loaded[0].headband).toBe('#00ff00');
  });
});

describe('Session persistence', () => {
  it('round-trips an account, including a credential that still accepts only the right hash', () => {
    const session = new Session();
    session.protect('secret hash');
    session.addBlocks(3);
    session.addDiamonds(4);
    session.setLook(parseLook('#00ff00', '#0000ff'));

    const restored = Session.fromStored(session.toStored('neo'));
    expect(restored.getScore()).toBe(60);
    expect(restored.getDiamonds()).toBe(4);
    expect(restored.getLook()).toEqual({ headband: '#00ff00', belt: '#0000ff' });
    expect(restored.acceptsPassword('secret hash')).toBe(true);
    expect(restored.acceptsPassword('guess')).toBe(false);
    expect(restored.acceptsPassword('')).toBe(false);
    expect(restored.unplugged()).toBe(true);
  });

  it('keeps an unprotected account unprotected, and never stores the hash itself', () => {
    const open = Session.fromStored(new Session().toStored('open'));
    expect(open.acceptsPassword('anything')).toBe(true);

    const protectedSession = new Session();
    protectedSession.protect('plain-text-hash');
    const stored = protectedSession.toStored('p');
    expect(Buffer.from(stored.digest!).toString('utf8')).not.toContain('plain-text-hash');
    expect(stored.kdf).toBe('scrypt1');
  });

  it('tells its listener about everything worth saving, and only that', () => {
    const session = new Session();
    let changes = 0;
    session.setChangeListener(() => changes++);

    session.protect('x');
    session.addBlocks(1);
    session.addDiamonds(1);
    session.setLook(parseLook('#00ff00', '#0000ff'));
    session.setLook(parseLook('#00ff00', '#0000ff')); // unchanged
    session.protect('y'); // already protected
    expect(changes).toBe(4);
  });
});

describe('Session.claimBlocks', () => {
  it('counts a burst of reported blocks, then only what the allowance refills', () => {
    const session = new Session();
    const start = Date.now();
    expect(session.claimBlocks(1000, start)).toBe(60);
    expect(session.getScore()).toBe(60 * 20);
    expect(session.claimBlocks(5, start)).toBe(0);

    expect(session.claimBlocks(100, start + 1000)).toBe(10);
    expect(session.claimBlocks(100, start + 61_000)).toBe(60);
  });

  it('ignores nonsense', () => {
    const session = new Session();
    expect(session.claimBlocks(0)).toBe(0);
    expect(session.claimBlocks(-5)).toBe(0);
    expect(session.getScore()).toBe(0);
  });
});

describe('validateSnapshot', () => {
  it('accepts a well-formed snapshot of this room size', () => {
    const snapshot = snapshotOf({ blocks: [{ kind: 'ice', x: 10, y: 20 }], robots: [{ x: 5, y: 5 }], players: [{ name: 'neo', x: 1, y: 2 }] });
    expect(validateSnapshot(JSON.parse(JSON.stringify(snapshot)), SIZE)).toEqual(snapshot);
  });

  it.each([
    ['not an object', 5],
    ['another version', { ...snapshotOf(), version: SNAPSHOT_VERSION + 1 }],
    ['another room size', { ...snapshotOf(), width: 10 }],
    ['an unknown block kind', snapshotOf({ blocks: [{ kind: 'plasma', x: 1, y: 1 }] })],
    ['a fractional position', snapshotOf({ robots: [{ x: 1.5, y: 1 }] })],
    ['a negative position', snapshotOf({ diamonds: [{ x: -1, y: 1 }] })],
    ['a nameless player', snapshotOf({ players: [{ name: '', x: 1, y: 1 }] })],
    ['missing lists', { version: SNAPSHOT_VERSION, ...SIZE }],
  ])('rejects %s', (_why, raw) => {
    expect(typeof validateSnapshot(raw, SIZE)).toBe('string');
  });
});

describe('Persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cyberstation-persist-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('starts fresh when there is no snapshot, or it is corrupt or from another version', () => {
    const persistence = new Persistence(dir);
    expect(persistence.loadSnapshot(SIZE)).toBeUndefined();

    writeFileSync(path.join(dir, SNAPSHOT_FILE), '{ this is not json');
    expect(persistence.loadSnapshot(SIZE)).toBeUndefined();

    writeFileSync(path.join(dir, SNAPSHOT_FILE), JSON.stringify({ ...snapshotOf(), version: 0 }));
    expect(persistence.loadSnapshot(SIZE)).toBeUndefined();
    persistence.close();
  });

  it('falls back to the previous snapshot when the newest one is unusable', () => {
    const persistence = new Persistence(dir);
    writeFileSync(path.join(dir, SNAPSHOT_FILE), '');
    writeFileSync(path.join(dir, SNAPSHOT_PREVIOUS_FILE), JSON.stringify(snapshotOf({ robots: [{ x: 7, y: 7 }] })));
    expect(persistence.loadSnapshot(SIZE)?.robots).toEqual([{ x: 7, y: 7 }]);
    persistence.close();
  });

  describe('across a restart', () => {
    const config: ServerConfig = { ...defaultConfig(), snapshotIntervalMs: 3_600_000 };

    it('brings back accounts and the room as they were', () => {
      const first = new Persistence(dir);
      const world = new World({ persistence: first, config });
      const zion = world.getZion();
      const room = zion.getMainRoom()!;

      const avatar = room.addAvatarAtEntrance('neo')!;
      const session = new Session(avatar);
      session.protect('hash');
      zion.addSession('neo', session);
      session.addBlocks(5);
      session.addDiamonds(3);
      session.setLook(parseLook('#00ff00', '#0000ff'));
      const saved = captureSnapshot(room);
      expect(saved.blocks.length).toBeGreaterThan(10);
      expect(saved.robots.length).toBeGreaterThan(0);
      first.close();

      const second = new Persistence(dir);
      const reborn = new World({ persistence: second, config }).getZion();
      const restored = reborn.getHardlines().get('neo')!;
      expect(restored.getScore()).toBe(100);
      expect(restored.getDiamonds()).toBe(3);
      expect(restored.getLook()).toEqual({ headband: '#00ff00', belt: '#0000ff' });
      expect(restored.acceptsPassword('hash')).toBe(true);
      expect(restored.acceptsPassword('nope')).toBe(false);

      // Their avatar is back where it stood, asleep until they log in again.
      const body = restored.getAvatar()!;
      expect(body.getName()).toBe('neo');
      expect(body.isSleeping()).toBe(true);
      expect([body.getX(), body.getY()]).toEqual([avatar.getX(), avatar.getY()]);

      const after = captureSnapshot(reborn.getMainRoom()!);
      const sorted = <T extends { x: number; y: number }>(points: T[]) => JSON.stringify([...points].sort((a, b) => a.x - b.x || a.y - b.y));
      expect(sorted(after.blocks)).toBe(sorted(saved.blocks));
      expect(after.robots).toHaveLength(saved.robots.length);
      expect(after.players.map((p) => p.name)).toEqual(['neo']);
      second.close();
    });

    it('writes the snapshot atomically, keeping the previous one', () => {
      const persistence = new Persistence(dir);
      new World({ persistence, config });
      persistence.flush();
      persistence.flush();

      for (const file of [SNAPSHOT_FILE, SNAPSHOT_PREVIOUS_FILE]) {
        expect(validateSnapshot(JSON.parse(readFileSync(path.join(dir, file), 'utf8')), SIZE)).toMatchObject({ version: SNAPSHOT_VERSION });
      }
      persistence.close();
    });

    it('does not capture robots as players, nor dead or removed sprites', () => {
      const world = new World({ config });
      const room = world.getZion().getMainRoom()!;
      const avatar = room.addAvatarAtEntrance('ghost')!;
      avatar.removePermanently();
      const robot = room.getCellData().getSprites().find((s) => s instanceof Robot)!;
      const snapshot = captureSnapshot(room);

      expect(snapshot.players.map((p) => p.name)).not.toContain('ghost');
      expect(snapshot.robots).toContainEqual({ x: robot.getX(), y: robot.getY() });
      expect(room.getCellData().getSprites().some((s) => s instanceof Avatar && !(s instanceof Robot))).toBe(true);
    });
  });
});
