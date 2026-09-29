import type { World } from '../world';
import { Cell, OUTER_WALL_SIZE } from './cell';
import { ClusteredInitException } from '../errors';
import { CellData } from '../cellData';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { Ice } from '../sprite/ice';
import { Launcher } from '../sprite/launcher';
import { Mana } from '../sprite/mana';
import { Portal } from '../sprite/portal';
import { Robot } from '../sprite/robot';
import { SpawnPortal } from '../sprite/spawnPortal';
import { Thruster } from '../sprite/thruster';
import { Wall } from '../sprite/wall';

// Grid-unit (CellData.ANIMATION_STEP px) layout constants for the fixed layout below.
const HOLE_LEFT = 190;
const HOLE_RIGHT = 310;
const ROW_Y = [40, 100, 160];
const STONE_LENGTH = 5;
const LEFT_COLUMN_X = 210;
const MID_LEFT_COLUMN_X = 230;
const MID_RIGHT_COLUMN_X = 270;
const RIGHT_COLUMN_X = 290;
// Each column's stones are spaced 20 units apart vertically (still climbable straight up/down on its own),
// but the four columns are offset from each other by 5 units so there's a stone within easy reach practically
// everywhere in the shaft, not just every 20 units up one single column.
const STEPPING_STONE_COLUMNS: ReadonlyArray<readonly [number, number]> = [
  [MID_RIGHT_COLUMN_X, 5],
  [LEFT_COLUMN_X, 10],
  [MID_LEFT_COLUMN_X, 15],
  [RIGHT_COLUMN_X, 20],
];

// Fixed mana/launcher fixtures on the (obstacle-free) floor, just right of the warp portal, purely so
// e2e tests have deterministic targets for the mana-pickup and death/respawn workflows (see WORKFLOWS.md).
// The rest of the room's boosters/launchers/ice/robots stay randomly placed. Exported in pixels so e2e
// specs don't need to duplicate the grid-to-pixel math.
const TEST_THRUSTER_X = 280;
const TEST_LAUNCHER_X = 320;
export const TEST_FIXTURE_PIXELS = {
  thrusterX: TEST_THRUSTER_X * CellData.ANIMATION_STEP,
  launcherX: TEST_LAUNCHER_X * CellData.ANIMATION_STEP,
};
// Random boosters/launchers/ice reroll their x out of this range so they can't land anywhere along the
// floor between the warp portal, the fixed test fixtures above, and the shaft e2e tests fall through — e2e
// tests walk that whole stretch and (mostly) can't jump-clear an obstacle blocking a portal/mana/launcher
// interaction.
const TEST_FIXTURE_KEEPOUT = { min: OUTER_WALL_SIZE + 8, max: TEST_LAUNCHER_X + 80 };
// Vertical gap (grid units) of open air below the spawn portal before the floor beneath it, so an avatar
// deposited there visibly drops instead of appearing already standing.
const SPAWN_PORTAL_GAP = 14;

const ROOM_WIDTH_PX = 4000;
const ROOM_HEIGHT_PX = 2000;
const GRID_WIDTH = Math.floor(ROOM_WIDTH_PX / CellData.ANIMATION_STEP);
const GRID_HEIGHT = Math.floor(ROOM_HEIGHT_PX / CellData.ANIMATION_STEP);
const GRID_FLOOR_Y = GRID_HEIGHT - OUTER_WALL_SIZE - 2;
const SPAWN_PORTAL_Y = GRID_FLOOR_Y - SpawnPortal.HEIGHT - SPAWN_PORTAL_GAP;
const STARGATE_Y = ROW_Y[0] - Portal.HEIGHT;

// Fixed, deterministic pixel position for the spawn portal, exported so e2e specs (which can't run
// TypeScript room-building code) can target/assert against it without duplicating this layout math.
export const SPAWN_ENTRANCE_PIXELS = {
  x: (GRID_WIDTH / 2 - SpawnPortal.WIDTH / 2) * CellData.ANIMATION_STEP,
  y: SPAWN_PORTAL_Y * CellData.ANIMATION_STEP,
} as const;

/**
 * The single reusable "main multiplayer mode" room layout: a big rectangle with long
 * horizontal platforms, a center hole (bridged by four stepping-stone columns players
 * can climb straight up/down), scattered decorative blocks, two animated stargate warp
 * portals in the top corners, and one small floating spawn portal at the bottom center
 * (where most avatars first land, and where warping through either stargate deposits
 * them). Built as a deterministic stand-in for the randomly-generated "side-quest" rooms
 * so e2e tests have stable geometry to target (see TODOS.md).
 */
export class MainRoom extends Cell {
  constructor(world: World) {
    super(world);
  }

  getMinCellWidth(): number {
    return ROOM_WIDTH_PX;
  }

  getMinCellHeight(): number {
    return ROOM_HEIGHT_PX;
  }

  usePortal(): boolean {
    return true;
  }

  getNumBoosters(): number {
    return 15;
  }

  getNumLaunchers(): number {
    return 20;
  }

  getNumIce(): number {
    return 5;
  }

  getNumRobots(): number {
    return 8;
  }

  override init(): Cell {
    const data = this.getCellData();
    Avatar.init(data);
    CellBlock.init(data);
    SpawnPortal.init(data);
    Portal.init(data);
    Thruster.init(data);
    Launcher.init(data);
    Ice.init(data);

    const width = this.getWidth();
    const height = Math.floor(this.getMinCellHeight() / CellData.ANIMATION_STEP);
    const floorY = height - OUTER_WALL_SIZE - 2;

    this.buildOuterWalls(width, height);
    this.buildPlatformRows(width, floorY);
    this.buildSteppingStones(floorY);
    this.buildClutter(width);
    this.buildStargatePortals(width);
    this.buildSpawnPortal(width, floorY);
    this.buildTestFixtures(floorY);
    this.buildPickupsAndRobots();

    return this;
  }

  private buildOuterWalls(width: number, height: number): void {
    const wallWidth = Math.floor(width / CellBlock.SIZE);
    const wallHeight = Math.floor(height / CellBlock.SIZE);

    new Wall(false, CellBlock.SIZE, 0, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, CellBlock.SIZE, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, CellBlock.SIZE * 2, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, CellBlock.SIZE * 3, wallWidth - CellBlock.SIZE, this);
    new Wall(true, width - CellBlock.SIZE, 0, wallHeight, this);
    new Wall(true, width - CellBlock.SIZE * 2, 0, wallHeight, this);
    new Wall(true, width - CellBlock.SIZE * 3, 0, wallHeight, this);
    new Wall(true, width - CellBlock.SIZE * 4, 0, wallHeight, this);
    new Wall(false, CellBlock.SIZE, height - CellBlock.SIZE, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, height - CellBlock.SIZE * 2, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, height - CellBlock.SIZE * 3, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, height - CellBlock.SIZE * 4, wallWidth - CellBlock.SIZE, this);
    new Wall(true, 0, 0, wallHeight, this);
    new Wall(true, CellBlock.SIZE, 0, wallHeight, this);
    new Wall(true, CellBlock.SIZE * 2, 0, wallHeight, this);
    new Wall(true, CellBlock.SIZE * 3, 0, wallHeight, this);
  }

  /** Three long horizontal platform rows plus a solid floor, each row missing its center span (the "hole"). */
  private buildPlatformRows(width: number, floorY: number): void {
    for (const rowY of ROW_Y) {
      new Wall(false, OUTER_WALL_SIZE, rowY, (HOLE_LEFT - OUTER_WALL_SIZE) / CellBlock.SIZE, this);
      new Wall(false, HOLE_RIGHT, rowY, (width - OUTER_WALL_SIZE - HOLE_RIGHT) / CellBlock.SIZE, this);
    }
    new Wall(false, OUTER_WALL_SIZE, floorY, (width - OUTER_WALL_SIZE * 2) / CellBlock.SIZE, this);
  }

  /** Four vertical columns of small platforms through the hole, each climbable straight up/down in ~20-unit
   * steps; the columns are offset from each other so there's always a nearby stone somewhere in reach. */
  private buildSteppingStones(floorY: number): void {
    for (const [x, startOffset] of STEPPING_STONE_COLUMNS) {
      for (let y = ROW_Y[0] + startOffset; y < floorY; y += 20) {
        new Wall(false, x, y, STONE_LENGTH, this);
      }
    }
  }

  /** Freestanding blocks scattered on top of every elevated platform row ("a lot of blocks"). The floor stays
   * clear so it can double as an obstacle-free walkway for e2e tests (portal warp, mana pickup, death/respawn). */
  private buildClutter(width: number): void {
    const segments: Array<[number, number, number]> = [
      [OUTER_WALL_SIZE, HOLE_LEFT, ROW_Y[0]],
      [HOLE_RIGHT, width - OUTER_WALL_SIZE, ROW_Y[0]],
      [OUTER_WALL_SIZE, HOLE_LEFT, ROW_Y[1]],
      [HOLE_RIGHT, width - OUTER_WALL_SIZE, ROW_Y[1]],
      [OUTER_WALL_SIZE, HOLE_LEFT, ROW_Y[2]],
      [HOLE_RIGHT, width - OUTER_WALL_SIZE, ROW_Y[2]],
    ];

    for (const [segStart, segEnd, rowY] of segments) {
      for (let x = segStart + 20; x < segEnd - 20; x += 40) {
        try {
          new CellBlock(x, rowY - CellBlock.SIZE, false, this);
        } catch (e) {
          if (!(e instanceof ClusteredInitException)) throw e;
        }
      }
    }
  }

  /** Two animated stargate warp portals resting on the top platform row's corners; walking into either
   * relocates the avatar to a random other room's spawn portal (see Portal.warpRandomly). */
  private buildStargatePortals(width: number): void {
    const positions: Array<[number, number]> = [
      [OUTER_WALL_SIZE + 4, STARGATE_Y],
      [width - OUTER_WALL_SIZE - Portal.WIDTH - 4, STARGATE_Y],
    ];

    for (const [x, y] of positions) {
      try {
        new Portal(x, y, true, this);
      } catch (e) {
        if (!(e instanceof ClusteredInitException)) throw e;
      }
    }
  }

  /** The single small circular spawn portal, floating above the floor (with an open-air gap beneath it) at
   * the bottom center, directly below the stepping-stone shaft — where most avatars first land, and where
   * a stargate warp deposits them. */
  private buildSpawnPortal(width: number, floorY: number): void {
    try {
      this.entrances.push(new SpawnPortal(width / 2 - SpawnPortal.WIDTH / 2, floorY - SpawnPortal.HEIGHT - SPAWN_PORTAL_GAP, true, this));
    } catch (e) {
      if (!(e instanceof ClusteredInitException)) throw e;
    }
  }

  /** One fixed Thruster and Launcher near spawn, resting on the floor, for deterministic e2e coverage. */
  private buildTestFixtures(floorY: number): void {
    const y = floorY - Mana.SIZE;

    try {
      new Thruster(TEST_THRUSTER_X, y, true, this);
    } catch (e) {
      if (!(e instanceof ClusteredInitException)) throw e;
    }

    try {
      new Launcher(TEST_LAUNCHER_X, y, true, this);
    } catch (e) {
      if (!(e instanceof ClusteredInitException)) throw e;
    }
  }

  /** Like getRandomX, but rerolls out of the fixed test fixtures' keepout zone. */
  private getRandomTestSafeX(spriteSize: number): number {
    let x = this.getRandomX(spriteSize);
    while (x + spriteSize >= TEST_FIXTURE_KEEPOUT.min && x <= TEST_FIXTURE_KEEPOUT.max) {
      x = this.getRandomX(spriteSize);
    }
    return x;
  }

  private buildPickupsAndRobots(): void {
    for (let i = 0; i < this.getNumBoosters(); i++) {
      try {
        new Thruster(this.getRandomTestSafeX(Mana.SIZE), this.getRandomY(Mana.SIZE), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }

    for (let i = 0; i < this.getNumLaunchers(); i++) {
      try {
        new Launcher(this.getRandomTestSafeX(Mana.SIZE), this.getRandomY(Mana.SIZE), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }

    for (let i = 0; i < this.getNumIce(); i++) {
      try {
        new Ice(this.getRandomTestSafeX(Mana.SIZE), this.getRandomY(Mana.SIZE), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }

    for (let i = 0; i < this.getNumRobots(); i++) {
      try {
        new Robot(this.getRandomTestSafeX(Avatar.WIDTH), this.getRandomY(Avatar.HEIGHT), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }
  }
}
