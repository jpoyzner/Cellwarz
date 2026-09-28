import type { Cell } from './cell/cell';
import type { Sprite } from './sprite/sprite';

export class Engine {
  static readonly ENGINE_FRAMES_PER_SECOND = 48;
  static readonly REDRAW_ECHO_FRAMES = 10;

  static readonly ALL_STEPS = 1;
  static readonly HALF_STEP = 2;
  static readonly QUARTER_STEP = 4;
  static readonly EIGHTH_STEP = 8;
  static readonly SIXTEENTH_STEP = 16;
  static readonly EVERY_SECOND = Engine.ENGINE_FRAMES_PER_SECOND;
  static readonly SECONDS_REFRESH_INTERVAL = 3;

  // Caps how many simulation steps a single interval callback can run back-to-back, so a long stall (GC
  // pause, debugger break) can't force a "spiral of death" of ever-growing catch-up work.
  private static readonly MAX_CATCHUP_STEPS = 5;

  private readonly cell: Cell;
  private redrawSprites: Sprite[] = [];
  private frameNumber = 0;
  private lastStepTime = 0;
  private accumulatedMs = 0;

  constructor(cell: Cell) {
    this.cell = cell;
    cell.setEngine(this);
  }

  start(): void {
    const stepMs = 1000 / Engine.ENGINE_FRAMES_PER_SECOND;
    this.lastStepTime = Date.now();

    setInterval(() => {
      const now = Date.now();
      this.accumulatedMs = Math.min(this.accumulatedMs + (now - this.lastStepTime), stepMs * Engine.MAX_CATCHUP_STEPS);
      this.lastStepTime = now;

      // Run as many fixed-size simulation steps as the elapsed wall-clock time calls for, instead of
      // assuming setInterval fired at exactly 1000/48ms — keeps sim speed correct even if the event loop
      // drifts or briefly stalls, rather than silently running the whole game slower.
      while (this.accumulatedMs >= stepMs) {
        this.step();
        this.accumulatedMs -= stepMs;
      }
    }, stepMs);
  }

  private step(): void {
    const newRedrawSprites: Sprite[] = [];

    for (const sprite of this.cell.getCellData().getSprites()) {
      sprite.process();

      if (sprite.needsRedraw()) {
        newRedrawSprites.push(sprite);
      }
    }

    this.cell.process();

    this.frameNumber = this.frameNumber === Engine.ENGINE_FRAMES_PER_SECOND - 1 ? 0 : this.frameNumber + 1;
    this.redrawSprites = newRedrawSprites;
  }

  shouldAnimateFrame(sprite: Sprite): boolean {
    return this.frameNumber % sprite.getAnimationFrequency() === 0;
  }

  getAnimationsPerSecond(sprite: Sprite): number {
    return Engine.ENGINE_FRAMES_PER_SECOND / sprite.getAnimationFrequency();
  }

  actionMatchesFrequency(frequency: number): boolean {
    return this.frameNumber % frequency === 0;
  }

  getRedrawSprites(): Sprite[] {
    return this.redrawSprites;
  }

  getCell(): Cell {
    return this.cell;
  }
}
