import { defaultConfig } from './config';
import type { ServerConfig } from './config';
import { Engine } from './engine';
import type { Persistence, PersistenceSource } from './persistence';
import { randomInt } from './random';
import { restorePlayers } from './roomSnapshot';
import { Session } from './session';
import type { World } from './world';
import type { Cell } from './cell/cell';
import { MainRoom } from './cell/mainRoom';

const MAINTENANCE_INTERVAL_MS = 10_000;

export class Zion implements PersistenceSource {
  private readonly hardlines = new Map<string, Session>();
  private readonly matrix: Engine[] = [];
  private readonly staleLogins = new Set<string>();

  constructor(
    world: World,
    private readonly persistence?: Persistence,
    private readonly config: ServerConfig = defaultConfig(),
  ) {
    if (persistence) {
      for (const user of persistence.loadUsers()) this.addSession(user.login, Session.fromStored(user), false);
    }

    // Single shared room for now so all multiplayer logins land together (see TODOS.md).
    const room = new MainRoom(world);
    const snapshot = persistence?.loadSnapshot({ width: room.getMinCellWidth(), height: room.getMinCellHeight() });
    if (snapshot) {
      room.restoreFrom(snapshot);
      console.log(`Restoring the room saved at ${snapshot.savedAt}.`);
    }

    this.addCell(room);
    if (snapshot) restorePlayers(room, snapshot, (login) => this.sessionFor(login));

    persistence?.start(this, config.snapshotIntervalMs);
    setInterval(() => this.evictSleepers(), MAINTENANCE_INTERVAL_MS).unref();
  }

  private addCell(cell: Cell): void {
    const engine = new Engine(cell);
    this.matrix.push(engine);
    engine.getCell().init();
    engine.start();
  }

  getHardlines(): Map<string, Session> {
    return this.hardlines;
  }

  getSessions(): Map<string, Session> {
    return this.hardlines;
  }

  getMainRoom(): Cell | undefined {
    return this.matrix[0]?.getCell();
  }

  /** Registers a player's session; from then on anything about it worth saving reaches the database. */
  addSession(login: string, session: Session, isNew = true): void {
    this.hardlines.set(login, session);
    session.setChangeListener(() => this.persistence?.markDirty(login));
    if (isNew) this.persistence?.markDirty(login);
  }

  private sessionFor(login: string): Session {
    let session = this.hardlines.get(login);
    if (!session) {
      session = new Session();
      this.addSession(login, session);
    }
    return session;
  }

  /** How many players are connected right now (sleeping avatars with no connection don't take up a place). */
  connectedPlayers(): number {
    let count = 0;
    for (const session of this.hardlines.values()) if (session.isConnected()) count++;
    return count;
  }

  /** Whether `login` would be turned away because the station already holds as many players as it may. */
  isFull(login: string): boolean {
    return !this.hardlines.get(login)?.isConnected() && this.connectedPlayers() >= this.config.maxPlayers;
  }

  /** Removes avatars that have been asleep (no connection) longer than allowed; the player's account is untouched. */
  evictSleepers(now = Date.now()): number {
    let evicted = 0;
    for (const session of this.hardlines.values()) {
      const avatar = session.getAvatar();
      if (!avatar || session.isConnected() || !avatar.isSleeping()) continue;
      if (now - avatar.getSleepingSince() < this.config.sleeperEvictMs) continue;

      session.unplug();
      avatar.removePermanently();
      evicted++;
    }
    return evicted;
  }

  getRandomEngine(): Engine {
    return this.matrix[randomInt(this.matrix.length)];
  }

  loginNeedsRefresh(login: string): void {
    this.staleLogins.add(login);
  }

  loginNotStale(login: string): void {
    if (this.stale(login)) {
      this.staleLogins.delete(login);
    }
  }

  stale(login: string): boolean {
    return this.staleLogins.has(login);
  }
}
