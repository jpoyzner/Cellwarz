import type { Cell } from '../cell/cell';
import type { CellData } from '../cellData';
import { EdgeOfCellDataException } from '../errors';
import { Engine } from '../engine';
import type { Frame } from '../frame';
import { Physics } from '../physics';
import { Ice } from './ice';
import { Launcher } from './launcher';
import { Mana } from './mana';
import { MAX_RAINBOW_BLOCKS, RainbowBlock } from './rainbowBlock';
import { Shield } from './shield';
import { DEFAULT_ACTION, Sprite } from './sprite';
import { StickyBlock } from './stickyBlock';
import { Thruster } from './thruster';
import { addAction } from './frames';

// The head turns to face the way it will spit: one pre-drawn pose per 15 degrees (0 = right, 90 = straight down,
// 180 = left), and the nearest pose to the real angle is shown.
const POSE_STEP_DEGREES = 15;
const POSE_DEGREES = Array.from({ length: 180 / POSE_STEP_DEGREES + 1 }, (_, i) => i * POSE_STEP_DEGREES);
const chargeAction = (degrees: number): string => `charge${degrees}`;
const spitAction = (degrees: number): string => `spit${degrees}`;

export const SPIT_INTERVAL_FRAMES = 30 * Engine.EVERY_SECOND;
const CHARGE_FRAMES = Engine.EVERY_SECOND;
const SPIT_POSE_FRAMES = Engine.EVERY_SECOND / 2;
// A block leaves at a random speed (cells per frame; the most a block can travel is 3) and a random angle across the
// whole half circle below the flower, so blocks land far apart rather than in one pile. The head pivots where the
// stem ends and the mouth is this far (cells) out along its facing direction; both are measured from the sprite's top left.
const HEAD_PIVOT = { x: 6, y: 7.25 };
const MOUTH_DISTANCE = 4;
const MIN_SPIT_SPEED = 1;
const MAX_SPIT_SPEED = 3;

// Purple blocks are left out, matching the room's own switched-off purple blocks (see Cell.getNumGravityBlocks).
// Rainbow blocks are kept apart: they are only made while fewer than MAX_RAINBOW_BLOCKS exist.
const BLOCK_KINDS: ReadonlyArray<(x: number, y: number, cell: Cell) => Mana> = [
  (x, y, cell) => new Thruster(x, y, false, cell),
  (x, y, cell) => new Launcher(x, y, false, cell),
  (x, y, cell) => new Ice(x, y, false, cell),
  (x, y, cell) => new Shield(x, y, false, cell),
  (x, y, cell) => new StickyBlock(x, y, false, cell),
];
const MAKE_RAINBOW_BLOCK = (x: number, y: number, cell: Cell): Mana => new RainbowBlock(x, y, false, cell);

/**
 * A flower hanging by its stem from the ceiling that spits a random kind of block out of its mouth every 30 seconds,
 * at a random angle and speed; a second beforehand its head turns to face that way. Purely a spawner: it sits on the ghost layer so nothing collides with it.
 */
export class Flower extends Sprite {
  static readonly WIDTH = 12;
  static readonly HEIGHT = 12;

  private static readonly actionFrames = new Map<string, Frame[]>();

  private framesUntilSpit = SPIT_INTERVAL_FRAMES;
  private spitPoseFrames = 0;
  /** Where the next block will go, in radians (0 = right, π/2 = straight down); picked when the head starts turning. */
  private spitAngle = Math.PI / 2;

  static init(cellData: CellData): void {
    addAction(cellData, DEFAULT_ACTION, 'flower/idle', 2, false, Flower.actionFrames);
    for (const degrees of POSE_DEGREES) {
      addAction(cellData, chargeAction(degrees), `flower/charge/${degrees}_`, 2, false, Flower.actionFrames);
      addAction(cellData, spitAction(degrees), `flower/spit/${degrees}`, 1, false, Flower.actionFrames);
    }
  }

  /** `spitsBlocks` false leaves a purely decorative flower (rooms that keep their blocks fixed, e.g. for tests). */
  constructor(x: number, y: number, cellInit: boolean, cell: Cell, private readonly spitsBlocks = true) {
    super(x, y, cellInit, cell);
  }

  getActionFrames(): Map<string, Frame[]> {
    return Flower.actionFrames;
  }

  getWidth(): number {
    return Flower.WIDTH;
  }

  getHeight(): number {
    return Flower.HEIGHT;
  }

  getLayer(): number {
    return Physics.BACKGROUND_LAYER;
  }

  override getMass(): number {
    return 0;
  }

  override melts(): boolean {
    return true;
  }

  override isStable(): boolean {
    return true;
  }

  protected override animate(): boolean {
    return true;
  }

  override getAnimationFrequency(): number {
    return Engine.EIGHTH_STEP;
  }

  protected override doAction(): void {
    if (!this.spitsBlocks) return;

    if (this.spitPoseFrames > 0 && --this.spitPoseFrames === 0) this.pose(DEFAULT_ACTION);

    if (this.framesUntilSpit > 0) this.framesUntilSpit--;
    if (this.framesUntilSpit === CHARGE_FRAMES) {
      this.spitAngle = Math.random() * Math.PI;
      this.pose(chargeAction(this.poseDegrees()));
    }

    if (this.framesUntilSpit > 0) return;

    if (this.spit()) {
      // A spit that finds its spot occupied just waits (still at zero) for a clear frame.
      this.framesUntilSpit = SPIT_INTERVAL_FRAMES;
      this.spitPoseFrames = SPIT_POSE_FRAMES;
      this.pose(spitAction(this.poseDegrees()));
    }
  }

  private pose(action: string): void {
    if (this.setAnimationSequence(action)) this.needsRedraw(true);
  }

  private poseDegrees(): number {
    const degrees = Math.round(((this.spitAngle * 180) / Math.PI) / POSE_STEP_DEGREES) * POSE_STEP_DEGREES;
    return Math.min(180, Math.max(0, degrees));
  }

  /** Makes one block at the mouth and fires it the way the head faces; false if something is in the way. */
  private spit(): boolean {
    const mouthX = this.getX() + HEAD_PIVOT.x + MOUTH_DISTANCE * Math.cos(this.spitAngle);
    const mouthY = this.getY() + HEAD_PIVOT.y + MOUTH_DISTANCE * Math.sin(this.spitAngle);
    const x = Math.round(mouthX - Mana.SIZE / 2);
    const y = Math.round(mouthY - Mana.SIZE / 2);
    if (!this.isClear(x, y)) return false;

    const kinds = this.rainbowBlocksAtCap() ? BLOCK_KINDS : [...BLOCK_KINDS, MAKE_RAINBOW_BLOCK];
    const create = kinds[Math.floor(Math.random() * kinds.length)];
    const block = create(x, y, this.cell);
    const speed = MIN_SPIT_SPEED + Math.random() * (MAX_SPIT_SPEED - MIN_SPIT_SPEED);
    block.eject(Math.cos(this.spitAngle) * speed, Math.sin(this.spitAngle) * speed);
    return true;
  }

  private rainbowBlocksAtCap(): boolean {
    let rainbows = 0;
    for (const sprite of this.cellData.getSprites()) {
      if (sprite instanceof RainbowBlock && !sprite.removed()) rainbows++;
    }
    return rainbows >= MAX_RAINBOW_BLOCKS;
  }

  /** Whether no sprite other than this flower covers a block-sized spot (the mouth is inside the flower's own box). */
  private isClear(x: number, y: number): boolean {
    try {
      for (let column = x; column < x + Mana.SIZE; column++) {
        for (let row = y; row < y + Mana.SIZE; row++) {
          for (const sprite of this.cellData.getMapPosition(column, row) ?? []) if (sprite !== this) return false;
        }
      }
    } catch (e) {
      if (e instanceof EdgeOfCellDataException) return false;
      throw e;
    }

    return true;
  }
}
