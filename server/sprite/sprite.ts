import { CellData } from '../cellData';
import { EdgeOfCellDataException } from '../errors';
import type { Cell } from '../cell/cell';
import { Engine } from '../engine';
import { Force } from '../force';
import type { Frame } from '../frame';
import { Physics } from '../physics';

export const DEFAULT_ACTION = 'none';

export abstract class Sprite {
  static readonly DEFAULT_IMAGE_DIR = 'images/';

  private readonly cellIndex: number;

  private x: number;
  private y: number;

  private clippedX: number;
  private clippedY: number;
  private clippedWidth: number;
  private clippedHeight: number;

  protected animationSequence: string;
  private currentFrameIndex = 0;
  private needsRedrawFlag = false;
  private redrawEcho = 0;
  private removedEcho = 0;
  private removedFlag = false;
  private toDelete = false;

  private force: Force | undefined;
  private gravitateCount = 0;
  private consumeScale: number | undefined;

  protected readonly cell: Cell;
  protected readonly cellData: CellData;
  protected readonly physics: Physics;
  protected readonly engine: Engine;

  constructor(x: number, y: number, cellInit: boolean, cell: Cell) {
    this.cell = cell;
    this.cellData = cell.getCellData();
    this.physics = cell.getWorld().getPhysics();
    this.engine = cell.getEngine();

    this.x = x;
    this.y = y;
    this.clippedX = x;
    this.clippedY = y;
    this.clippedWidth = this.getWidth();
    this.clippedHeight = this.getHeight();

    this.animationSequence = this.getDefaultAction();

    this.cellIndex = this.cellData.add(this, cellInit);
    this.resetGravitateCount();
  }

  getCellData(): CellData {
    return this.cellData;
  }

  getCellIndex(): number {
    return this.cellIndex;
  }

  getX(): number {
    return this.x;
  }

  changeXBy(delta: number): void {
    this.x += delta;
    this.clippedX += delta;
  }

  getClippedX(): number {
    return this.clippedX;
  }

  setClippedX(clippedX: number): void {
    this.clippedX = clippedX;
  }

  getXPixels(): number {
    return this.x * CellData.ANIMATION_STEP;
  }

  setX(x: number): void {
    this.x = x;
  }

  getY(): number {
    return this.y;
  }

  changeYBy(delta: number): void {
    this.y += delta;
    this.clippedY += delta;
  }

  getClippedY(): number {
    return this.clippedY;
  }

  setClippedY(clippedY: number): void {
    this.clippedY = clippedY;
  }

  getYPixels(): number {
    return this.y * CellData.ANIMATION_STEP;
  }

  setY(y: number): void {
    this.y = y;
  }

  getClippedWidth(): number {
    return this.clippedWidth;
  }

  setClippedWidth(clippedWidth: number): void {
    this.clippedWidth = clippedWidth;
  }

  getClippedHeight(): number {
    return this.clippedHeight;
  }

  setClippedHeight(clippedHeight: number): void {
    this.clippedHeight = clippedHeight;
  }

  getAnimationSequence(): string {
    return this.animationSequence;
  }

  /** Returns whether the redraw actually took effect (false if blocked by a nearby sprite). */
  setAnimationSequence(animationSequence: string): boolean {
    if (animationSequence !== this.animationSequence) {
      const oldAnimationSequence = this.animationSequence;
      const oldFrameIndex = this.currentFrameIndex;
      let redraw = true;

      const oldFrame = this.getCurrentFrame();
      this.animationSequence = animationSequence;
      this.currentFrameIndex = 0;
      const newFrame = this.getCurrentFrame();

      const topAdjustment = oldFrame.getTopClip() - newFrame.getTopClip();
      if (topAdjustment > 0 && this.physics.reachSprite(this, Physics.NONE, Physics.UP, topAdjustment)) {
        redraw = false;
      }

      const rightAdjustment = oldFrame.getRightClip() - newFrame.getRightClip();
      if (rightAdjustment > 0 && this.physics.reachSprite(this, Physics.RIGHT, Physics.NONE, rightAdjustment)) {
        redraw = false;
      }

      const bottomAdjustment = oldFrame.getBottomClip() - newFrame.getBottomClip();
      if (bottomAdjustment > 0 && this.physics.reachSprite(this, Physics.NONE, Physics.DOWN, bottomAdjustment)) {
        redraw = false;
      }

      const leftAdjustment = oldFrame.getLeftClip() - newFrame.getLeftClip();
      if (leftAdjustment > 0 && this.physics.reachSprite(this, Physics.LEFT, Physics.NONE, leftAdjustment)) {
        redraw = false;
      }

      if (redraw) {
        try {
          this.cellData.adjustClipping(this, topAdjustment, rightAdjustment, bottomAdjustment, leftAdjustment);
        } catch (e) {
          if (!(e instanceof EdgeOfCellDataException)) throw e;
        }
      } else {
        this.animationSequence = oldAnimationSequence;
        this.currentFrameIndex = oldFrameIndex;
      }

      return redraw;
    }

    return true;
  }

  getFrame(): number {
    return this.currentFrameIndex;
  }

  setFrame(frame: number): void {
    this.currentFrameIndex = frame;
  }

  getImageIndex(): number {
    return this.getCurrentFrame().getImageIndex();
  }

  process(): void {
    if (this.removed()) {
      if (this.removedEcho === 0) {
        if (this.toDelete) {
          this.delete();
        }
        this.removedEcho--;
        this.needsRedrawFlag = false;
      } else if (this.removedEcho > 0) {
        this.removedEcho--;
        this.needsRedrawFlag = true;
      }
    } else {
      this.needsRedrawFlag = this.needsRedrawFlag || this.redrawEcho > 0;

      if (this.animate() && this.engine.shouldAnimateFrame(this)) {
        const frames = this.getActionFrames().get(this.animationSequence)!;
        this.currentFrameIndex = this.currentFrameIndex === frames.length - 1 ? 0 : this.currentFrameIndex + 1;

        this.needsRedrawFlag = true;
        this.redrawEcho = Engine.REDRAW_ECHO_FRAMES;
      } else if (this.redrawEcho !== 0) {
        this.redrawEcho--;
      }

      // A sprite being swallowed by a planet is steered by the planet alone, not by its own gravity/AI/input.
      if (this.consumeScale === undefined) this.doAction();
    }
  }

  getCurrentFrame(): Frame {
    return this.getActionFrames().get(this.animationSequence)![this.currentFrameIndex];
  }

  protected getDefaultAction(): string {
    return DEFAULT_ACTION;
  }

  protected doAction(): void {}

  protected animate(): boolean {
    return false;
  }

  getAnimationFrequency(): number {
    return Engine.ALL_STEPS;
  }

  needsRedraw(): boolean;
  needsRedraw(value: boolean): void;
  needsRedraw(value?: boolean): boolean | void {
    if (value === undefined) {
      return this.needsRedrawFlag;
    }
    this.needsRedrawFlag = value;
  }

  delete(): void {
    this.cellData.remove(this);
  }

  removed(): boolean {
    return this.removedFlag;
  }

  remove(): void {
    this.removedFlag = true;
    this.removedEcho = Engine.REDRAW_ECHO_FRAMES;
  }

  removePermanently(): void {
    this.removedFlag = true;
    this.removedEcho = Engine.REDRAW_ECHO_FRAMES;
    this.toDelete = true;
  }

  replace(): void {
    this.removedFlag = false;
  }

  melts(): boolean {
    return false;
  }

  getMass(): number {
    return 1;
  }

  getForce(): Force | undefined {
    return this.force;
  }

  setForce(xDirection: number, yDirection: number): Force {
    this.force = new Force(xDirection, yDirection, this.getMass());
    return this.force;
  }

  getGravitateCount(): number {
    return this.gravitateCount;
  }

  addGravitateCount(): void {
    this.gravitateCount++;
  }

  resetGravitateCount(): void {
    this.gravitateCount = 0;
  }

  isEffect(): boolean {
    return false;
  }

  /** Planet-swallow progress: 1 when it starts shrinking away, 0 once gone; undefined if not being swallowed. */
  getConsumeScale(): number | undefined {
    return this.consumeScale;
  }

  setConsumeScale(scale: number): void {
    this.consumeScale = scale;
    this.needsRedrawFlag = true;
  }

  /** Called once a planet has finished swallowing this sprite; avatars override it to die. */
  onConsumed(): void {
    this.removePermanently();
  }

  /** Whether a room's background planet pulls this sprite toward it (avatars/robots and mana blocks do). */
  isAffectedByPlanets(): boolean {
    return false;
  }

  /** Replaces the Java marker interface `Stable` (CellBlock, CryogenicDoor override to true). */
  isStable(): boolean {
    return false;
  }

  getCell(): Cell {
    return this.cell;
  }

  abstract getWidth(): number;
  abstract getHeight(): number;
  abstract getLayer(): number;
  abstract getActionFrames(): Map<string, Frame[]>;
}
