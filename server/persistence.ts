import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Cell } from './cell/cell';
import { captureSnapshot, validateSnapshot } from './roomSnapshot';
import type { RoomSnapshot } from './roomSnapshot';
import type { Session } from './session';
import { UserStore } from './userStore';
import type { StoredUser } from './userStore';

export const SNAPSHOT_FILE = 'room-snapshot.json';
export const SNAPSHOT_PREVIOUS_FILE = 'room-snapshot.prev.json';
export const DATABASE_FILE = 'cyberstation.db';

/** What persistence needs from the running game (so it can be tested without a whole world). */
export interface PersistenceSource {
  getSessions(): Map<string, Session>;
  getMainRoom(): Cell | undefined;
}

/**
 * Keeps the game across restarts: players' accounts go to a SQLite database shortly after they change, and the main
 * room is snapshotted every few seconds to a file (atomically, keeping the previous one) and again on shutdown. A
 * snapshot that is missing, corrupt, or from another layout/version is skipped (falling back to the previous one,
 * then to a fresh room) rather than stopping the server from starting.
 */
export class Persistence {
  private readonly users: UserStore;
  private readonly dirty = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private source: PersistenceSource | undefined;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.users = new UserStore(path.join(dir, DATABASE_FILE));
  }

  loadUsers(): StoredUser[] {
    return this.users.loadAll();
  }

  /** The newest usable snapshot for a room of this size, or undefined to start fresh. */
  loadSnapshot(expected: { width: number; height: number }): RoomSnapshot | undefined {
    for (const file of [SNAPSHOT_FILE, SNAPSHOT_PREVIOUS_FILE]) {
      const full = path.join(this.dir, file);
      if (!existsSync(full)) continue;

      try {
        const checked = validateSnapshot(JSON.parse(readFileSync(full, 'utf8')), expected);
        if (typeof checked !== 'string') return checked;
        console.warn(`Ignoring ${file}: ${checked}.`);
      } catch (e) {
        console.warn(`Ignoring ${file}: it could not be read (${(e as Error).message}).`);
      }
    }

    return undefined;
  }

  markDirty(login: string): void {
    this.dirty.add(login);
  }

  /** Starts the periodic save; `intervalMs` is also how often the dirty accounts reach the database. */
  start(source: PersistenceSource, intervalMs: number): void {
    this.source = source;
    this.timer = setInterval(() => this.flush(), intervalMs);
    this.timer.unref();
  }

  /** Writes the changed accounts and a fresh room snapshot now; failures are logged, never thrown (the game goes on). */
  flush(): void {
    this.flushUsers();
    this.flushSnapshot();
  }

  /** Saves only the accounts (used when the room itself might be in a bad state, e.g. after a crash). */
  flushUsers(): void {
    if (!this.source || this.dirty.size === 0) return;

    const sessions = this.source.getSessions();
    const logins = [...this.dirty];
    this.dirty.clear();
    try {
      const users: StoredUser[] = [];
      for (const login of logins) {
        const session = sessions.get(login);
        if (session) users.push(session.toStored(login));
      }
      this.users.saveAll(users);
    } catch (e) {
      console.error('Could not save players:', e);
      for (const login of logins) this.dirty.add(login);
    }
  }

  private flushSnapshot(): void {
    const room = this.source?.getMainRoom();
    if (!room) return;

    try {
      const target = path.join(this.dir, SNAPSHOT_FILE);
      const temporary = `${target}.tmp`;
      writeFileSync(temporary, JSON.stringify(captureSnapshot(room)));
      if (existsSync(target)) renameSync(target, path.join(this.dir, SNAPSHOT_PREVIOUS_FILE));
      renameSync(temporary, target);
    } catch (e) {
      console.error('Could not save the room:', e);
    }
  }

  /** Final save, then closes the database (shutdown). */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.flush();
    this.users.close();
  }
}
