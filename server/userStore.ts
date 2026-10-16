import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** One player's account as saved: who they are (callsign + salted credential), their totals and their colours. */
export interface StoredUser {
  login: string;
  salt: Uint8Array | null;
  digest: Uint8Array | null;
  kdf: string | null;
  score: number;
  diamonds: number;
  headband: string | null;
  belt: string | null;
}

const SCHEMA_VERSION = 1;

/** The player database: a single SQLite file (Node's built-in driver), written through in small batches. */
export class UserStore {
  private readonly db: DatabaseSync;

  /** `file` is a path (its folder is created) or ':memory:'. */
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.migrate();
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (row.user_version > SCHEMA_VERSION) {
      throw new Error(`The user database is from a newer version of the game (schema ${row.user_version}).`);
    }

    if (row.user_version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          login TEXT PRIMARY KEY,
          salt BLOB,
          digest BLOB,
          kdf TEXT,
          score INTEGER NOT NULL DEFAULT 0,
          diamonds INTEGER NOT NULL DEFAULT 0,
          headband TEXT,
          belt TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
  }

  loadAll(): StoredUser[] {
    const rows = this.db.prepare('SELECT login, salt, digest, kdf, score, diamonds, headband, belt FROM users').all();
    return rows as unknown as StoredUser[];
  }

  /** Inserts or updates every given user in one transaction. */
  saveAll(users: StoredUser[]): void {
    if (users.length === 0) return;

    const now = Date.now();
    const upsert = this.db.prepare(`
      INSERT INTO users (login, salt, digest, kdf, score, diamonds, headband, belt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(login) DO UPDATE SET
        salt = excluded.salt, digest = excluded.digest, kdf = excluded.kdf, score = excluded.score,
        diamonds = excluded.diamonds, headband = excluded.headband, belt = excluded.belt, updated_at = excluded.updated_at
    `);

    this.db.exec('BEGIN');
    try {
      for (const user of users) {
        upsert.run(user.login, user.salt, user.digest, user.kdf, user.score, user.diamonds, user.headband, user.belt, now, now);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  close(): void {
    this.db.close();
  }
}
