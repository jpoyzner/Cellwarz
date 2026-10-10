import { CellData } from '../cellData';
import { ClusteredInitException, EdgeOfCellDataException } from '../errors';
import type { Engine } from '../engine';
import { PlanetField } from '../planet';
import type { PlanetState } from '../planet';
import { randomInt } from '../random';
import type { World } from '../world';
import { Avatar } from '../sprite/avatar';
import { CellBlock } from '../sprite/cellBlock';
import type { Entrance } from '../sprite/entrance';
import { GravityBlock } from '../sprite/gravityBlock';
import { Ice } from '../sprite/ice';
import { Launcher } from '../sprite/launcher';
import { Mana } from '../sprite/mana';
import { Missile } from '../sprite/missile';
import { Portal } from '../sprite/portal';
import { RainbowBlock } from '../sprite/rainbowBlock';
import { Robot } from '../sprite/robot';
import { RocketLauncher } from '../sprite/rocketLauncher';
import { Shield } from '../sprite/shield';
import { SpawnPortal } from '../sprite/spawnPortal';
import { StickyBlock } from '../sprite/stickyBlock';
import { Thruster } from '../sprite/thruster';
import type { Sprite } from '../sprite/sprite';
import { Wall } from '../sprite/wall';

export const OUTER_WALL_SIZE = CellBlock.SIZE * 4;

// Random-floor spawning (see addAvatarAtRandomFloor): how many spots to try, and how far (grid units) a robot must be.
const RANDOM_FLOOR_ATTEMPTS = 400;
const ROBOT_SAFE_DISTANCE = 24;

export type BackgroundKind = 'space' | 'station' | 'temple';

/** A ceiling lamp (pixels) casting a triangle of light down to `bottomY`, `halfWidth` either side of `x` there. */
export interface Lamp {
  x: number;
  topY: number;
  bottomY: number;
  halfWidth: number;
  /** Horizontal pixel span the beam is clipped to (the inner faces of the end walls). */
  minX: number;
  maxX: number;
}

/** A background TV screen (pixels, top-left origin) the client plays video on; never collides with anything. */
export interface Tv {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where the two chains holding the TV up end, on the wall directly above it. */
  chainTopY: number;
}

export abstract class Cell {
  private readonly width: number;
  private readonly height: number;

  private readonly world: World;
  private readonly data: CellData;
  private engine!: Engine;
  // Multiple deposit points (spawn/warp-arrival) are supported; addAvatarAtEntrance picks one at random.
  protected entrances: Entrance[] = [];
  private readonly planets: PlanetField | undefined;

  constructor(world: World) {
    this.world = world;
    this.width = Math.floor(this.getMinCellWidth() / CellData.ANIMATION_STEP);
    this.height = Math.floor(this.getMinCellHeight() / CellData.ANIMATION_STEP);
    this.data = new CellData(this.width, this.height, world, this.wrapsAtEdges());
    if (this.usesPlanets()) {
      this.planets = new PlanetField(this.getMinCellWidth(), this.getMinCellHeight(), Avatar.HEIGHT * CellData.ANIMATION_STEP);
    }
  }

  /** Registers every sprite type's art, always in the same order (the frame tables are shared across rooms). */
  protected initSprites(): void {
    Avatar.init(this.data);
    CellBlock.init(this.data);
    SpawnPortal.init(this.data);
    Portal.init(this.data);
    Thruster.init(this.data);
    Launcher.init(this.data);
    Ice.init(this.data);
    Shield.init(this.data);
    GravityBlock.init(this.data);
    StickyBlock.init(this.data);
    RainbowBlock.init(this.data);
    Missile.init(this.data);
    RocketLauncher.init(this.data);
  }

  init(): Cell {
    this.initSprites();

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

    this.spawnPickupsAndRobots((spriteSize) => this.getRandomX(spriteSize));

    return this;
  }

  /** Scatters every kind of block and the robots at random spots; `randomX` lets a room keep some columns clear. */
  protected spawnPickupsAndRobots(randomX: (spriteSize: number) => number): void {
    const blocks: Array<[number, (x: number, y: number) => Mana]> = [
      [this.getNumBoosters(), (x, y) => new Thruster(x, y, true, this)],
      [this.getNumLaunchers(), (x, y) => new Launcher(x, y, true, this)],
      [this.getNumIce(), (x, y) => new Ice(x, y, true, this)],
      [this.getNumShields(), (x, y) => new Shield(x, y, true, this)],
      [this.getNumGravityBlocks(), (x, y) => new GravityBlock(x, y, true, this)],
      [this.getNumStickyBlocks(), (x, y) => new StickyBlock(x, y, true, this)],
      [this.getNumRainbowBlocks(), (x, y) => new RainbowBlock(x, y, true, this)],
    ];

    for (const [count, create] of blocks) {
      for (let i = 0; i < count; i++) {
        try {
          create(randomX(Mana.SIZE), this.getRandomY(Mana.SIZE));
        } catch (e) {
          if (e instanceof ClusteredInitException) i--;
          else throw e;
        }
      }
    }

    for (let i = 0; i < this.getNumRobots(); i++) {
      try {
        new Robot(randomX(Avatar.WIDTH), this.getRandomY(Avatar.HEIGHT), true, this);
      } catch (e) {
        if (e instanceof ClusteredInitException) i--;
        else throw e;
      }
    }
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

  protected wrapsAtEdges(): boolean {
    return false;
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

  /**
   * Deposits a new avatar on a random bare patch of floor: a spot is picked, dropped straight down to whatever it
   * would land on, and only used if it rests on wall blocks with nothing but wall blocks around it (no pickups,
   * portals or other avatars) and no robot nearby. Falls back to an entrance if no such spot turns up. Set
   * CELLWARZ_RANDOM_TELEPORT=off to always use the entrances (the deterministic e2e specs rely on that).
   */
  addAvatarAtRandomFloor(name: string): Avatar | undefined {
    if (process.env.CELLWARZ_RANDOM_TELEPORT === 'off') return this.addAvatarAtEntrance(name);

    const robots = this.data.getSprites().filter((sprite): sprite is Avatar => sprite instanceof Avatar && sprite.isRobot());
    const xRange = this.width - OUTER_WALL_SIZE * 2 - Avatar.WIDTH;
    const yRange = this.height - OUTER_WALL_SIZE * 2 - Avatar.HEIGHT;
    if (xRange <= 0 || yRange <= 0) return this.addAvatarAtEntrance(name);

    for (let attempt = 0; attempt < RANDOM_FLOOR_ATTEMPTS; attempt++) {
      const x = OUTER_WALL_SIZE + randomInt(xRange);
      const y = this.findBareFloorTop(x, OUTER_WALL_SIZE + randomInt(yRange));
      if (y === undefined) continue;
      if (robots.some((robot) => Math.abs(robot.getX() - x) < ROBOT_SAFE_DISTANCE && Math.abs(robot.getY() - y) < ROBOT_SAFE_DISTANCE)) continue;

      try {
        return new Avatar(name, x, y, true, this);
      } catch (e) {
        if (!(e instanceof ClusteredInitException)) throw e;
      }
    }

    return this.addAvatarAtEntrance(name);
  }

  /** The top y an avatar at column `x` would stand at after falling from `startY` onto bare floor, if it can. */
  private findBareFloorTop(x: number, startY: number): number | undefined {
    for (let y = startY; y + Avatar.HEIGHT < this.height; y++) {
      if (y === startY && this.spritesInRect(x, y, Avatar.WIDTH, Avatar.HEIGHT)?.size !== 0) return undefined;

      const below = this.spritesInRect(x, y + Avatar.HEIGHT, Avatar.WIDTH, 1);
      if (!below) return undefined;
      if (below.size === 0) continue;

      // The standing frame is clipped a column on each side, so only the inner columns count as resting on something.
      const supported = (this.spritesInRect(x + 1, y + Avatar.HEIGHT, Avatar.WIDTH - 2, 1)?.size ?? 0) > 0;
      if (!supported) return undefined;

      const surroundings = this.spritesInRect(x - 1, y - 1, Avatar.WIDTH + 2, Avatar.HEIGHT + 2);
      const bare = surroundings !== undefined && [...surroundings].every((sprite) => sprite instanceof CellBlock);
      return bare ? y : undefined;
    }

    return undefined;
  }

  /** Every sprite on the grid cells of a rectangle, or undefined if it runs off the grid. */
  private spritesInRect(x: number, y: number, width: number, height: number): Set<Sprite> | undefined {
    const found = new Set<Sprite>();

    try {
      for (let column = x; column < x + width; column++) {
        for (let row = y; row < y + height; row++) {
          for (const sprite of this.data.getMapPosition(column, row) ?? []) found.add(sprite);
        }
      }
    } catch (e) {
      if (e instanceof EdgeOfCellDataException) return undefined;
      throw e;
    }

    return found;
  }

  process(): void {
    if (!this.planets) return;

    const physics = this.world.getPhysics();
    this.planets.step();
    this.planets.advanceConsumed(physics);
    for (const sprite of this.data.getSprites()) {
      if (sprite.isAffectedByPlanets()) this.planets.applyPull(sprite, physics);
    }
  }

  /** The room's current background planet (if it has any), for clients to draw and to gravitate sprites. */
  getPlanet(): PlanetState | undefined {
    return this.planets?.getState();
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

  /** Which client-side backdrop this room is drawn over; 'temple' is the default for randomly-generated rooms. */
  getBackground(): BackgroundKind {
    return 'temple';
  }

  /** Whether one gas giant at a time flies through this room's background, pulling nearby sprites toward it. */
  protected usesPlanets(): boolean {
    return false;
  }

  /** Purely cosmetic client-drawn lighting; lit avatars glow, unlit ones are left in the dark. */
  getLamps(): Lamp[] {
    return [];
  }

  /** Purely cosmetic client-drawn background TVs; the client picks and plays the video. */
  getTvs(): Tv[] {
    return [];
  }

  /** Counts of the newer block kinds default to none; rooms opt in by overriding. */
  getNumShields(): number {
    return 0;
  }

  getNumGravityBlocks(): number {
    return 0;
  }

  getNumStickyBlocks(): number {
    return 0;
  }

  getNumRainbowBlocks(): number {
    return 0;
  }

  abstract getMinCellWidth(): number;
  abstract getMinCellHeight(): number;
  abstract usePortal(): boolean;
  abstract getNumBoosters(): number;
  abstract getNumLaunchers(): number;
  abstract getNumIce(): number;
  abstract getNumRobots(): number;
}
