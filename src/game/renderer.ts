import type { Analyzer } from './analyzer';
import type { AvatarsMap, IncomingSprite, SpritesMap, StoredSprite, ToolsMap } from './types';

export interface RendererContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  backgroundEl: HTMLElement | null;
  dashboardEl: HTMLElement | null;
  images: HTMLImageElement[];
  loginName: string;
  analyzer?: Analyzer;
}

/** Mirrors js/renderer.js: draws directly to canvas every frame, bypassing React reconciliation for perf. */
export class Renderer {
  sprites: SpritesMap = {};
  avatars: AvatarsMap = {};
  tools: ToolsMap = {};
  imagePaths: string[] = [];

  private me: StoredSprite | undefined;
  private offsetX = 0;
  private offsetY = 0;
  private readonly windowWidth = window.innerWidth;
  private readonly windowHeight = window.innerHeight;

  constructor(private readonly context: RendererContext) {}

  getPlayerOffset(): { offsetX: number; offsetY: number; me: StoredSprite | undefined } {
    return { offsetX: this.offsetX, offsetY: this.offsetY, me: this.me };
  }

  loadImages(): void {
    this.imagePaths.forEach((path, i) => {
      const image = new Image();
      image.src = path;
      this.context.images[i] = image;
    });
  }

  render(renderData: Record<string, unknown>): void {
    const { ctx, canvas, backgroundEl } = this.context;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (backgroundEl) {
      backgroundEl.style.left = `${(this.offsetX / 10) * -1 - 55}px`;
      backgroundEl.style.top = `${(this.offsetY / 50) * -1 - 20}px`;
    }

    const spriteIds = Object.keys(renderData);
    if (spriteIds.length === 0) return;

    this.load(renderData, spriteIds);
    this.drawSprites();
    this.addScreenText();
    this.drawAvatarsNames();
    this.drawDashboardItems();

    if (this.context.analyzer) {
      this.context.analyzer.redraws++;
      this.context.analyzer.drawTime = Date.now() - this.context.analyzer.connectionTime;
    }
  }

  private load(data: Record<string, unknown>, spriteIds: string[]): void {
    for (const spriteId of spriteIds) {
      const newSprite = data[spriteId] as IncomingSprite;

      if (newSprite[0] === -1) {
        delete this.sprites[spriteId];
        continue;
      }

      const [imageIndex, x, y, extraInfo] = newSprite as [number, number, number, Record<string, unknown>?];
      this.sprites[spriteId] = [imageIndex, x, y];

      if (extraInfo) {
        const avatarName = extraInfo['0'] as string | undefined;
        if (avatarName) {
          this.avatars[avatarName] = spriteId;
        }

        const newTools = extraInfo['1'] as ToolsMap | undefined;
        if (newTools) {
          if (newTools['-1'] !== undefined) {
            this.removeDashboardItem();
          } else {
            this.tools = newTools;
          }
        }
      }
    }
  }

  private drawSprites(): void {
    this.offsetX = 0;
    this.offsetY = 0;

    this.me = this.sprites[this.avatars[this.context.loginName]];
    if (this.me) {
      this.offsetX = this.me[1] + 24 - this.windowWidth / 2;
      this.offsetY = this.me[2] + 16 - this.windowHeight / 2;
    }

    for (const spriteId of Object.keys(this.sprites)) {
      const sprite = this.sprites[spriteId];
      const image = this.context.images[sprite[0]];
      if (image) {
        this.context.ctx.drawImage(image, sprite[1] - this.offsetX, sprite[2] - this.offsetY);
      }
    }
  }

  drawStaleScreen(): void {
    const { ctx, canvas } = this.context;
    ctx.fillStyle = 'gray';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawSprites();
  }

  private addScreenText(): void {
    if (!this.context.analyzer) return;

    const { ctx } = this.context;
    ctx.fillStyle = '#FF9933';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(this.context.analyzer.state, 20, 70);
  }

  private drawAvatarsNames(): void {
    const { ctx } = this.context;
    ctx.fillStyle = 'red';
    ctx.font = 'bold 16px Arial';

    for (const name of Object.keys(this.avatars)) {
      const sprite = this.sprites[this.avatars[name]];
      if (sprite) {
        ctx.fillText(name, sprite[1] - 8 - this.offsetX, sprite[2] - 16 - this.offsetY);
      } else {
        delete this.avatars[name];
      }
    }
  }

  private drawDashboardItems(): void {
    if (Object.keys(this.tools).length !== 0) {
      const url = this.imagePaths[this.tools[0]];
      if (url && this.context.dashboardEl) {
        this.context.dashboardEl.style.backgroundImage = `url('${url}')`;
      }
      delete this.tools[0];
    }
  }

  private removeDashboardItem(): void {
    if (this.context.dashboardEl) {
      this.context.dashboardEl.style.backgroundImage = 'none';
    }
  }
}
