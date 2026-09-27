import { CellData } from '../cellData';
import { ClusteredInitException } from '../errors';
import { Engine } from '../engine';
import { randomInt } from '../random';
import type { World } from '../world';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import { CryogenicDoor } from '../sprite/cryogenicDoor';
import type { Entrance } from '../sprite/entrance';
import { Ice } from '../sprite/ice';
import { Launcher } from '../sprite/launcher';
import { Mana } from '../sprite/mana';
import { Portal } from '../sprite/portal';
import { Robot } from '../sprite/robot';
import { Thruster } from '../sprite/thruster';
import { Wall } from '../sprite/wall';

const OUTER_WALL_SIZE = CellBlock.SIZE * 4;

export abstract class Cell {
  private readonly width: number;
  private readonly height: number;

  private readonly world: World;
  private readonly data: CellData;
  private engine!: Engine;
  private entrance: Entrance | undefined;

  private newMessageEcho = 0;
  private message: string | undefined;

  constructor(world: World) {
    this.world = world;
    this.width = Math.floor(this.getMinCellWidth() / CellData.ANIMATION_STEP);
    this.height = Math.floor(this.getMinCellHeight() / CellData.ANIMATION_STEP);
    this.data = new CellData(this.width, this.height, world);
    this.newMessageEcho = 0;
  }

  init(): Cell {
    Avatar.init(this.data);
    CellBlock.init(this.data);
    CryogenicDoor.init(this.data);
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

    while (!this.entrance) {
      try {
        this.entrance = new CryogenicDoor(this.getRandomX(CryogenicDoor.WIDTH), this.getRandomY(CryogenicDoor.HEIGHT), true, this);
      } catch (e) {
        if (!(e instanceof ClusteredInitException)) throw e;
      }
    }

    if (this.usePortal()) {
      let portal: Portal | undefined;
      while (!portal) {
        try {
          portal = new Portal(this.getRandomX(CryogenicDoor.WIDTH), this.getRandomY(CryogenicDoor.HEIGHT), true, this);
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

  private getRandomX(spriteSize: number): number {
    return OUTER_WALL_SIZE + randomInt(this.width - OUTER_WALL_SIZE * 2) - spriteSize + 1;
  }

  private getRandomY(spriteSize: number): number {
    return OUTER_WALL_SIZE + randomInt(this.height - OUTER_WALL_SIZE * 2) - spriteSize + 1;
  }

  getCellData(): CellData {
    return this.data;
  }

  addAvatarAtEntrance(name: string): Avatar | undefined {
    if (!this.entrance) return undefined;

    try {
      return new Avatar(name, this.entrance.getEntranceX(), this.entrance.getEntranceY(), false, this);
    } catch (e) {
      if (e instanceof ClusteredInitException) return undefined;
      throw e;
    }
  }

  process(): void {
    if (this.newMessageEcho !== 0) {
      this.newMessageEcho--;
    }
  }

  getMessage(): string | undefined {
    return this.message;
  }

  postMessage(message: string): void {
    this.message = message;
    this.newMessageEcho = Engine.REDRAW_ECHO_FRAMES;
  }

  hasNewMessage(): boolean {
    return this.newMessageEcho !== 0;
  }

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

  abstract getMinCellWidth(): number;
  abstract getMinCellHeight(): number;
  abstract usePortal(): boolean;
  abstract getNumBoosters(): number;
  abstract getNumLaunchers(): number;
  abstract getNumIce(): number;
  abstract getNumRobots(): number;
}
