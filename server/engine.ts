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

  private readonly cell: Cell;
  private redrawSprites: Sprite[] = [];
  private frameNumber = 0;

  constructor(cell: Cell) {
    this.cell = cell;
    cell.setEngine(this);
  }

  start(): void {
    setInterval(() => {
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
    }, 1000 / Engine.ENGINE_FRAMES_PER_SECOND);
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
