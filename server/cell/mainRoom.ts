import type { World } from '../world';
import { Cell, OUTER_WALL_SIZE } from './cell';
import { ClusteredInitException } from '../errors';
import { CellData } from '../cellData';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { CryogenicDoor } from '../sprite/cryogenicDoor';
import { Ice } from '../sprite/ice';
import { Launcher } from '../sprite/launcher';
import { Mana } from '../sprite/mana';
import { Portal } from '../sprite/portal';
import { Robot } from '../sprite/robot';
import { Thruster } from '../sprite/thruster';
import { Wall } from '../sprite/wall';

// Grid-unit (CellData.ANIMATION_STEP px) layout constants for the fixed layout below.
const HOLE_LEFT = 190;
const HOLE_RIGHT = 310;
const ROW_Y = [40, 100, 160];
const STONE_LENGTH = 5;
const LEFT_COLUMN_X = 210;
const RIGHT_COLUMN_X = 290;

// Fixed mana/launcher fixtures on the (obstacle-free) floor, just right of the entrance, purely so
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
// floor between the entrance, the bottom-left portal, and the fixed test fixtures above — e2e tests walk
// that whole stretch and (mostly) can't jump-clear an obstacle blocking a portal/mana/launcher interaction.
const TEST_FIXTURE_KEEPOUT = { min: OUTER_WALL_SIZE + 8, max: TEST_LAUNCHER_X + 80 };

/**
 * The single reusable "main multiplayer mode" room layout: a big rectangle with long
 * horizontal platforms, a center hole (bridged by two stepping-stone columns players
 * can climb straight up/down), scattered decorative blocks, and one portal in each
 * corner. Built as a deterministic stand-in for the randomly-generated "side-quest"
 * rooms so e2e tests have stable geometry to target (see TODOS.md).
 */
export class MainRoom extends Cell {
  private static readonly WIDTH_PX = 4000;
  private static readonly HEIGHT_PX = 2000;

  constructor(world: World) {
    super(world);
  }

  getMinCellWidth(): number {
    return MainRoom.WIDTH_PX;
  }

  getMinCellHeight(): number {
    return MainRoom.HEIGHT_PX;
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
    // Robots only ever run one direction until they're permanently blocked by the first solid obstacle in
    // their path, so any placed near the entrance would inevitably camp on the fixed test fixtures above
    // (there's no dedicated robot e2e coverage yet to justify that risk — see TODOS.md).
    return 0;
  }

  override init(): Cell {
    const data = this.getCellData();
    Avatar.init(data);
    CellBlock.init(data);
    CryogenicDoor.init(data);
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
    this.buildEntrance(width, floorY);
    this.buildCornerPortals(width, floorY);
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

  /** Two vertical columns of small platforms through the hole, each climbable straight up/down in ~20-unit steps. */
  private buildSteppingStones(floorY: number): void {
    for (let y = ROW_Y[0] + 10; y < floorY; y += 20) {
      new Wall(false, LEFT_COLUMN_X, y, STONE_LENGTH, this);
    }
    for (let y = ROW_Y[0] + 20; y < floorY; y += 20) {
      new Wall(false, RIGHT_COLUMN_X, y, STONE_LENGTH, this);
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

  /** Single entrance centered on the floor, directly below the stepping-stone shaft. */
  private buildEntrance(width: number, floorY: number): void {
    try {
      this.entrance = new CryogenicDoor(width / 2 - CryogenicDoor.WIDTH / 2, floorY - CryogenicDoor.HEIGHT, true, this);
    } catch (e) {
      if (!(e instanceof ClusteredInitException)) throw e;
    }
  }

  /** One portal per corner, each resting on the nearest platform segment so it's always reachable. */
  private buildCornerPortals(width: number, floorY: number): void {
    const corners: Array<[number, number]> = [
      [OUTER_WALL_SIZE + 4, ROW_Y[0] - CryogenicDoor.HEIGHT],
      [width - OUTER_WALL_SIZE - CryogenicDoor.WIDTH - 4, ROW_Y[0] - CryogenicDoor.HEIGHT],
      [OUTER_WALL_SIZE + 4, floorY - CryogenicDoor.HEIGHT],
      [width - OUTER_WALL_SIZE - CryogenicDoor.WIDTH - 4, floorY - CryogenicDoor.HEIGHT],
    ];

    for (const [x, y] of corners) {
      try {
        new Portal(x, y, true, this);
      } catch (e) {
        if (!(e instanceof ClusteredInitException)) throw e;
      }
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
