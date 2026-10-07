import { CellData } from '../cellData';
import { ClusteredInitException } from '../errors';
import type { Engine } from '../engine';
import { randomInt } from '../random';
import type { World } from '../world';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import type { Entrance } from '../sprite/entrance';
import { Ice } from '../sprite/ice';
import { Launcher } from '../sprite/launcher';
import { Mana } from '../sprite/mana';
import { Portal } from '../sprite/portal';
import { Robot } from '../sprite/robot';
import { SpawnPortal } from '../sprite/spawnPortal';
import { Thruster } from '../sprite/thruster';
import { Wall } from '../sprite/wall';

export const OUTER_WALL_SIZE = CellBlock.SIZE * 4;

export type BackgroundKind = 'space' | 'temple';

/** A ceiling lamp (pixels) casting a triangle of light down to `bottomY`, `halfWidth` either side of `x` there. */
export interface Lamp {
  x: number;
  topY: number;
  bottomY: number;
  halfWidth: number;
}

export abstract class Cell {
  private readonly width: number;
  private readonly height: number;

  private readonly world: World;
  private readonly data: CellData;
  private engine!: Engine;
  // Multiple deposit points (spawn/warp-arrival) are supported; addAvatarAtEntrance picks one at random.
  protected entrances: Entrance[] = [];

  constructor(world: World) {
    this.world = world;
    this.width = Math.floor(this.getMinCellWidth() / CellData.ANIMATION_STEP);
    this.height = Math.floor(this.getMinCellHeight() / CellData.ANIMATION_STEP);
    this.data = new CellData(this.width, this.height, world);
  }

  init(): Cell {
    Avatar.init(this.data);
    CellBlock.init(this.data);
    SpawnPortal.init(this.data);
    Portal.init(this.data);
    Thruster.init(this.data);
    Launcher.init(this.data);
    Ice.init(this.data);

    const wallWidth = Math.floor(this.width / CellBlock.SIZE);
    const wallHeight = Math.floor(this.height / CellBlock.SIZE);

    // Outer walls.
    new Wall(false, CellBlock.SIZE, 0, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, CellBlock.SIZE, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, CellBlock.SIZE * 2, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, CellBlock.SIZE * 3, wallWidth - CellBlock.SIZE, this);
    new Wall(true, this.width - CellBlock.SIZE, 0, wallHeight, this);
    new Wall(true, this.width - CellBlock.SIZE * 2, 0, wallHeight, this);
    new Wall(true, this.width - CellBlock.SIZE * 3, 0, wallHeight, this);
    new Wall(true, this.width - CellBlock.SIZE * 4, 0, wallHeight, this);
    new Wall(false, CellBlock.SIZE, this.height - CellBlock.SIZE, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, this.height - CellBlock.SIZE * 2, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, this.height - CellBlock.SIZE * 3, wallWidth - CellBlock.SIZE, this);
    new Wall(false, CellBlock.SIZE, this.height - CellBlock.SIZE * 4, wallWidth - CellBlock.SIZE, this);
    new Wall(true, 0, 0, wallHeight, this);
    new Wall(true, CellBlock.SIZE, 0, wallHeight, this);
    new Wall(true, CellBlock.SIZE * 2, 0, wallHeight, this);
    new Wall(true, CellBlock.SIZE * 3, 0, wallHeight, this);

    for (let i = 0; i < 10; i++) {
      let x = this.getRandomX(1);
      x = x % 2 === 0 ? x : x - 1;
      let y = this.getRandomY(1);
      y = y % 2 === 0 ? y : y - 1;
      const vertical = false;

      new Wall(
        vertical,
        x,
        y,
        Math.floor(randomInt(vertical ? this.height - y - OUTER_WALL_SIZE : this.width - x - OUTER_WALL_SIZE) / CellBlock.SIZE),
        this,
      );
    }

    while (this.entrances.length === 0) {
      try {
        this.entrances.push(new SpawnPortal(this.getRandomX(SpawnPortal.WIDTH), this.getRandomY(SpawnPortal.HEIGHT), true, this));
      } catch (e) {
        if (!(e instanceof ClusteredInitException)) throw e;
      }
    }

    if (this.usePortal()) {
      let portal: Portal | undefined;
      while (!portal) {
        try {
          portal = new Portal(this.getRandomX(Portal.WIDTH), this.getRandomY(Portal.HEIGHT), true, this);
        } catch (e) {
          if (!(e instanceof ClusteredInitException)) throw e;
        }
      }
    }

    for (let i = 0; i < this.getNumBoosters(); i++) {
      try {
        new Thruster(this.getRandomX(Mana.SIZE), this.getRandomY(Mana.SIZE), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }

    for (let i = 0; i < this.getNumLaunchers(); i++) {
      try {
        new Launcher(this.getRandomX(Mana.SIZE), this.getRandomY(Mana.SIZE), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }

    for (let i = 0; i < this.getNumIce(); i++) {
      try {
        new Ice(this.getRandomX(Mana.SIZE), this.getRandomY(Mana.SIZE), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }

    for (let i = 0; i < this.getNumRobots(); i++) {
      try {
        new Robot(this.getRandomX(Avatar.WIDTH), this.getRandomY(Avatar.HEIGHT), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }

    return this;
  }

  protected getRandomX(spriteSize: number): number {
    return OUTER_WALL_SIZE + randomInt(this.width - OUTER_WALL_SIZE * 2) - spriteSize + 1;
  }

  protected getRandomY(spriteSize: number): number {
    return OUTER_WALL_SIZE + randomInt(this.height - OUTER_WALL_SIZE * 2) - spriteSize + 1;
  }

  getCellData(): CellData {
    return this.data;
  }

  addAvatarAtEntrance(name: string): Avatar | undefined {
    if (this.entrances.length === 0) return undefined;
    const entrance = this.entrances[randomInt(this.entrances.length)];

    try {
      return new Avatar(name, entrance.getEntranceX(), entrance.getEntranceY(), false, this);
    } catch (e) {
      if (e instanceof ClusteredInitException) return undefined;
      throw e;
    }
  }

  process(): void {}

  getWorld(): World {
    return this.world;
  }

  getEngine(): Engine {
    return this.engine;
  }

  setEngine(engine: Engine): void {
    this.engine = engine;
  }

  getWidth(): number {
    return this.width;
  }

  // Mirrors the original Java bug: returns width, not height. Unused elsewhere; kept for parity.
  getHeight(): number {
    return this.width;
  }

  /** Which client-side backdrop this room is drawn over; 'temple' is the default for randomly-generated rooms. */
  getBackground(): BackgroundKind {
    return 'temple';
  }

  /** Purely cosmetic client-drawn lighting; lit avatars glow, unlit ones are left in the dark. */
  getLamps(): Lamp[] {
    return [];
  }

  abstract getMinCellWidth(): number;
  abstract getMinCellHeight(): number;
  abstract usePortal(): boolean;
  abstract getNumBoosters(): number;
  abstract getNumLaunchers(): number;
  abstract getNumIce(): number;
  abstract getNumRobots(): number;
}
