import type { Cell } from './cell/cell';
import { ClusteredInitException } from './errors';
import { Avatar } from './sprite/avatar';
import { Diamond } from './sprite/diamond';
import { GravityBlock } from './sprite/gravityBlock';
import { Ice } from './sprite/ice';
import { Launcher } from './sprite/launcher';
import type { Mana } from './sprite/mana';
import { RainbowBlock } from './sprite/rainbowBlock';
import { Robot } from './sprite/robot';
import { Shield } from './sprite/shield';
import { StickyBlock } from './sprite/stickyBlock';
import { Thruster } from './sprite/thruster';
import type { Session } from './session';

/**
 * Bump this whenever the room layout or what a snapshot holds changes: an older snapshot is then ignored and the room
 * starts fresh (the players' accounts live in the user database and are unaffected).
 */
export const SNAPSHOT_VERSION = 1;

const MAX_ENTRIES = 5000;
const MAX_NAME_LENGTH = 64;

type BlockFactory = new (x: number, y: number, cellInit: boolean, cell: Cell) => Mana;

const BLOCK_KINDS: ReadonlyArray<readonly [string, BlockFactory]> = [
  ['thruster', Thruster],
  ['launcher', Launcher],
  ['ice', Ice],
  ['shield', Shield],
  ['gravity', GravityBlock],
  ['sticky', StickyBlock],
  ['rainbow', RainbowBlock],
];

export interface SnapshotPoint {
  x: number;
  y: number;
}

/**
 * Where everything a player would notice was (grid units). Motion, fuses and other split-second state are deliberately
 * not kept: a restored room has every block, robot, diamond and sleeping avatar where it was, at rest.
 */
export interface RoomSnapshot {
  version: number;
  savedAt: string;
  /** The room's size in pixels, so a snapshot from a different layout is recognized and ignored. */
  width: number;
  height: number;
  blocks: Array<SnapshotPoint & { kind: string }>;
  robots: SnapshotPoint[];
  diamonds: SnapshotPoint[];
  players: Array<SnapshotPoint & { name: string }>;
}

export function captureSnapshot(cell: Cell, now = new Date()): RoomSnapshot {
  const snapshot: RoomSnapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: now.toISOString(),
    width: cell.getMinCellWidth(),
    height: cell.getMinCellHeight(),
    blocks: [],
    robots: [],
    diamonds: [],
    players: [],
  };

  for (const sprite of cell.getCellData().getSprites()) {
    if (sprite.removed()) continue;

    const point = { x: sprite.getX(), y: sprite.getY() };
    if (sprite instanceof Robot) {
      snapshot.robots.push(point);
    } else if (sprite instanceof Avatar) {
      snapshot.players.push({ name: sprite.getName(), ...point });
    } else if (sprite instanceof Diamond) {
      snapshot.diamonds.push(point);
    } else {
      const kind = BLOCK_KINDS.find(([, factory]) => sprite instanceof factory)?.[0];
      if (kind) snapshot.blocks.push({ kind, ...point });
    }
  }

  return snapshot;
}

const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100_000;

function validPoints(value: unknown, extra?: (entry: Record<string, unknown>) => boolean): boolean {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const record = entry as Record<string, unknown>;
    return isCoordinate(record.x) && isCoordinate(record.y) && (extra?.(record) ?? true);
  });
}

/** Checks parsed JSON really is a snapshot of this room layout; returns it, or the reason it can't be used. */
export function validateSnapshot(raw: unknown, expected: { width: number; height: number }): RoomSnapshot | string {
  if (typeof raw !== 'object' || raw === null) return 'not an object';

  const record = raw as Record<string, unknown>;
  if (record.version !== SNAPSHOT_VERSION) return `version ${String(record.version)} (this server writes ${SNAPSHOT_VERSION})`;
  if (record.width !== expected.width || record.height !== expected.height) return 'a different room size';

  const knownKinds = new Set(BLOCK_KINDS.map(([kind]) => kind));
  if (!validPoints(record.blocks, (entry) => typeof entry.kind === 'string' && knownKinds.has(entry.kind))) return 'bad blocks';
  if (!validPoints(record.robots)) return 'bad robots';
  if (!validPoints(record.diamonds)) return 'bad diamonds';
  if (!validPoints(record.players, (entry) => typeof entry.name === 'string' && entry.name.length > 0 && entry.name.length <= MAX_NAME_LENGTH)) {
    return 'bad players';
  }

  return record as unknown as RoomSnapshot;
}

function tryCreate(create: () => unknown): void {
  try {
    create();
  } catch (e) {
    // A spot that is no longer free (the layout moved on) just loses that one item.
    if (!(e instanceof ClusteredInitException)) throw e;
  }
}

/** Recreates the blocks, robots and diamonds of a snapshot in a freshly built room. */
export function restoreItems(cell: Cell, snapshot: RoomSnapshot): void {
  for (const { kind, x, y } of snapshot.blocks) {
    const factory = BLOCK_KINDS.find(([name]) => name === kind)?.[1];
    if (factory) tryCreate(() => new factory(x, y, true, cell));
  }

  for (const { x, y } of snapshot.robots) tryCreate(() => new Robot(x, y, true, cell));
  for (const { x, y } of snapshot.diamonds) tryCreate(() => new Diamond(x, y, 0, 0, cell));
}

/** Puts every saved player's avatar back, asleep where it stood (their connection comes back by logging in). */
export function restorePlayers(cell: Cell, snapshot: RoomSnapshot, sessionFor: (login: string) => Session): void {
  for (const { name, x, y } of snapshot.players) {
    const avatar = new Avatar(name, x, y, false, cell);
    sessionFor(name).plugin(avatar);
    avatar.fallAsleep();
  }
}
