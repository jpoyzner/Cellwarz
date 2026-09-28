import type { Analyzer } from './analyzer';
import { AudioManager } from './audio';
import { ParticleSystem } from './particles';
import { LocalPredictor } from './prediction';
import type { AvatarsMap, ConnectPayload, IncomingSprite, SpritesMap, StoredSprite, ToolsMap } from './types';

export interface RendererContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  backgroundEl: HTMLElement | null;
  dashboardEl: HTMLElement | null;
  images: HTMLImageElement[];
  loginName: string;
  analyzer?: Analyzer;
}

interface SmoothedPosition {
  x: number;
  y: number;
}

type VerticalState = 'up' | 'down' | 'idle';

// Exponential-decay smoothing time-constant applied to every sprite's rendered position: it turns raw,
// jittery per-message snapshots into continuous motion between server frames without needing a timestamped
// interpolation buffer. See src/game/prediction.ts for the local avatar's extra horizontal-prediction layer.
const SMOOTHING_TAU_MS = 60;
// A gap bigger than this (a wall, a push, a warp, a respawn) snaps the render position instead of sliding
// across the screen.
const RECONCILE_SNAP_THRESHOLD_PX = 32;
const WARP_DETECTION_THRESHOLD_PX = 64;

/** Mirrors js/renderer.js: draws directly to canvas every frame, bypassing React reconciliation for perf. */
export class Renderer {
  sprites: SpritesMap = {};
  avatars: AvatarsMap = {};
  tools: ToolsMap = {};
  imagePaths: string[] = [];

  private readonly audio = new AudioManager();
  private readonly particles = new ParticleSystem();
  private readonly predictor = new LocalPredictor();

  private readonly smoothed = new Map<string, SmoothedPosition>();
  private readonly lastY = new Map<string, number>();
  private readonly verticalState = new Map<string, VerticalState>();
  private localSpriteId: string | undefined;
  private hasConnectedOnce = false;
  private staleMode = false;

  private me: StoredSprite | undefined;
  private offsetX = 0;
  private offsetY = 0;
  private readonly windowWidth = window.innerWidth;
  private readonly windowHeight = window.innerHeight;

  private lastFrameTime = performance.now();
  private rafHandle: number | undefined;
  private stopped = false;

  private shakeUntil = 0;
  private shakeMagnitude = 0;
  private flashUntil = 0;
  private flashColor = '';

  constructor(private readonly context: RendererContext) {
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.stopped = true;
    if (this.rafHandle !== undefined) cancelAnimationFrame(this.rafHandle);
  }

  getPlayerOffset(): { offsetX: number; offsetY: number; me: StoredSprite | undefined } {
    return { offsetX: this.offsetX, offsetY: this.offsetY, me: this.me };
  }

  /** Forwards raw input so the local-avatar predictor can move the instant a key is pressed (see prediction.ts). */
  onLocalKey(keyCode: number, down: boolean): void {
    this.predictor.setKey(keyCode, down);

    if (down) {
      if (keyCode === 38) this.audio.play('jump');
      else if (keyCode === 32) this.audio.play('manaPickup');
      else if (keyCode === 49 || keyCode === 50 || keyCode === 51) this.audio.play('toolActivate');
    }
  }

  /** One-shot server ping sent the instant the local avatar's session unplugs — see server/socketHub.ts. */
  onLocalAvatarDeath(): void {
    this.audio.play('death');
    this.triggerShake(400, 10);
    this.triggerFlash(350, 'rgba(200, 30, 20, 0.35)');

    if (this.me) {
      this.particles.spawnImpact(this.me[1] + 24, this.me[2] + 32, 18);
    }
  }

  loadImages(): void {
    this.imagePaths.forEach((path, i) => {
      const image = new Image();
      image.src = path;
      this.context.images[i] = image;
    });
  }

  /** Full-refresh payloads (login/portal warp/stale recovery) replace state wholesale — no delta to diff. */
  applyFullState(data: ConnectPayload): void {
    const loginSpriteIdBefore = this.avatars[this.context.loginName];
    const before = loginSpriteIdBefore ? this.sprites[loginSpriteIdBefore] : undefined;

    this.sprites = data.sprites;
    this.avatars = data.avatars;
    this.tools = data.tools;
    this.imagePaths = data.imagePaths;
    this.loadImages();

    const loginSpriteIdAfter = this.avatars[this.context.loginName];
    const after = loginSpriteIdAfter ? this.sprites[loginSpriteIdAfter] : undefined;

    if (after && loginSpriteIdAfter !== this.localSpriteId) {
      // Respawn/relogin under a new avatar instance: start prediction fresh at the new position.
      this.smoothed.delete(loginSpriteIdAfter);
    }
    this.localSpriteId = loginSpriteIdAfter;

    if (after) {
      const dx = after[1] - (before?.[1] ?? after[1]);
      const dy = after[2] - (before?.[2] ?? after[2]);

      if (this.hasConnectedOnce && before && Math.hypot(dx, dy) > WARP_DETECTION_THRESHOLD_PX) {
        this.audio.play('portalWarp');
        this.particles.spawnWarp(after[1] + 24, after[2] + 32);
      }

      this.predictor.reset(after[1]);
    }

    this.hasConnectedOnce = true;
    this.staleMode = false;
  }

  render(data: Record<string, unknown>): void {
    const spriteIds = Object.keys(data);
    if (spriteIds.length === 0) return;

    this.staleMode = false;
    this.load(data, spriteIds);

    if (this.context.analyzer) {
      this.context.analyzer.redraws++;
      this.context.analyzer.drawTime = Date.now() - this.context.analyzer.connectionTime;
    }
  }

  drawStaleScreen(): void {
    this.staleMode = true;
  }

  private load(data: Record<string, unknown>, spriteIds: string[]): void {
    const avatarSpriteIds = new Set(Object.values(this.avatars));
    const localSpriteId = this.avatars[this.context.loginName];

    for (const spriteId of spriteIds) {
      const newSprite = data[spriteId] as IncomingSprite;

      if (newSprite[0] === -1) {
        if (avatarSpriteIds.has(spriteId)) {
          this.forgetAvatarName(spriteId);
        }

        if (avatarSpriteIds.has(spriteId)) {
          this.onAvatarRemoved(spriteId, localSpriteId);
        }
        delete this.sprites[spriteId];
        this.smoothed.delete(spriteId);
        this.lastY.delete(spriteId);
        this.verticalState.delete(spriteId);
        continue;
      }

      const [imageIndex, x, y, extraInfo] = newSprite as [number, number, number, Record<string, unknown>?];
      const previousX = this.sprites[spriteId]?.[1];
      this.sprites[spriteId] = [imageIndex, x, y];

      if (avatarSpriteIds.has(spriteId)) {
        this.detectVerticalTransition(spriteId, x, y, previousX, spriteId === localSpriteId);
      }

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

  private onAvatarRemoved(spriteId: string, localSpriteId: string | undefined): void {
    const last = this.sprites[spriteId];
    if (!last) return;

    this.particles.spawnImpact(last[1] + 24, last[2] + 32);
    // The local player's own death gets its richer dedicated effect via onLocalAvatarDeath(); avoid a double sound.
    if (spriteId !== localSpriteId) {
      this.audio.play('missileImpact');
    }
  }

  // Must happen synchronously with message processing (not lazily from the requestAnimationFrame draw loop,
  // which Chromium throttles/pauses for backgrounded/unfocused tabs) so a death is observable immediately
  // regardless of whether this tab currently has focus.
  private forgetAvatarName(spriteId: string): void {
    for (const name of Object.keys(this.avatars)) {
      if (this.avatars[name] === spriteId) {
        delete this.avatars[name];
      }
    }
  }

  private detectVerticalTransition(spriteId: string, x: number, y: number, previousX: number | undefined, isLocal: boolean): void {
    const prevY = this.lastY.get(spriteId);
    const prevState = this.verticalState.get(spriteId) ?? 'idle';

    if (prevY !== undefined) {
      const dy = y - prevY;
      const newState: VerticalState = dy < -1 ? 'up' : dy > 1 ? 'down' : 'idle';

      if (newState === 'up' && prevState !== 'up') {
        this.particles.spawnDust(x + 12, prevY + 48, 4);
        if (isLocal) this.audio.play('jump');
      } else if (newState === 'idle' && prevState === 'down') {
        this.particles.spawnDust(x + 12, y + 48, 6);
        if (isLocal) this.audio.play('land');
      } else if (newState === 'idle' && isLocal && previousX !== undefined && previousX !== x) {
        this.audio.play('run');
      }

      this.verticalState.set(spriteId, newState);
    }

    this.lastY.set(spriteId, y);
  }

  private triggerShake(durationMs: number, magnitudePx: number): void {
    this.shakeUntil = performance.now() + durationMs;
    this.shakeMagnitude = magnitudePx;
  }

  private triggerFlash(durationMs: number, color: string): void {
    this.flashUntil = performance.now() + durationMs;
    this.flashColor = color;
  }

  private readonly tick = (now: number): void => {
    if (this.stopped) return;

    const dtMs = Math.min(now - this.lastFrameTime, 100);
    this.lastFrameTime = now;

    this.particles.update(dtMs);
    this.advanceRenderPositions(dtMs);
    this.draw(now);

    this.rafHandle = requestAnimationFrame(this.tick);
  };

  private advanceRenderPositions(dtMs: number): void {
    const factor = 1 - Math.exp(-dtMs / SMOOTHING_TAU_MS);

    for (const spriteId of Object.keys(this.sprites)) {
      const sprite = this.sprites[spriteId];
      let targetX = sprite[1];
      const targetY = sprite[2];

      if (spriteId === this.localSpriteId) {
        targetX = this.predictor.getBlendedX(targetX, dtMs);
      }

      const current = this.smoothed.get(spriteId);
      if (!current) {
        this.smoothed.set(spriteId, { x: targetX, y: targetY });
        continue;
      }

      const dx = targetX - current.x;
      const dy = targetY - current.y;

      if (Math.abs(dx) > RECONCILE_SNAP_THRESHOLD_PX || Math.abs(dy) > RECONCILE_SNAP_THRESHOLD_PX) {
        current.x = targetX;
        current.y = targetY;
      } else {
        current.x += dx * factor;
        current.y += dy * factor;
      }
    }

    for (const spriteId of this.smoothed.keys()) {
      if (!(spriteId in this.sprites)) this.smoothed.delete(spriteId);
    }
  }

  private draw(now: number): void {
    const { ctx, canvas, backgroundEl } = this.context;

    if (this.staleMode) {
      ctx.fillStyle = 'gray';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    let shakeX = 0;
    let shakeY = 0;
    if (now < this.shakeUntil) {
      const remaining = (this.shakeUntil - now) / 400;
      shakeX = (Math.random() * 2 - 1) * this.shakeMagnitude * remaining;
      shakeY = (Math.random() * 2 - 1) * this.shakeMagnitude * remaining;
    }

    this.computeCameraOffset();
    const drawOffsetX = this.offsetX - shakeX;
    const drawOffsetY = this.offsetY - shakeY;

    if (backgroundEl) {
      backgroundEl.style.left = `${(drawOffsetX / 10) * -1 - 55}px`;
      backgroundEl.style.top = `${(drawOffsetY / 50) * -1 - 20}px`;
    }

    this.drawSprites(drawOffsetX, drawOffsetY);
    this.particles.draw(ctx, drawOffsetX, drawOffsetY);

    if (now < this.flashUntil) {
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    this.addScreenText();
    this.drawAvatarsNames(drawOffsetX, drawOffsetY);
    this.drawDashboardItems();
  }

  private computeCameraOffset(): void {
    this.offsetX = 0;
    this.offsetY = 0;

    const localSpriteId = this.avatars[this.context.loginName];
    this.me = localSpriteId ? this.sprites[localSpriteId] : undefined;
    if (!this.me) return;

    const rendered = (localSpriteId && this.smoothed.get(localSpriteId)) || undefined;
    const meX = rendered?.x ?? this.me[1];
    const meY = rendered?.y ?? this.me[2];

    this.offsetX = meX + 24 - this.windowWidth / 2;
    this.offsetY = meY + 16 - this.windowHeight / 2;
  }

  private drawSprites(offsetX: number, offsetY: number): void {
    for (const spriteId of Object.keys(this.sprites)) {
      const sprite = this.sprites[spriteId];
      const image = this.context.images[sprite[0]];
      if (!image) continue;

      const rendered = this.smoothed.get(spriteId);
      const x = rendered?.x ?? sprite[1];
      const y = rendered?.y ?? sprite[2];

      this.context.ctx.drawImage(image, x - offsetX, y - offsetY);
    }
  }

  private addScreenText(): void {
    if (!this.context.analyzer) return;

    const { ctx } = this.context;
    ctx.fillStyle = '#FF9933';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(this.context.analyzer.state, 20, 70);
  }

  private drawAvatarsNames(offsetX: number, offsetY: number): void {
    const { ctx } = this.context;
    ctx.fillStyle = 'red';
    ctx.font = 'bold 16px Arial';

    for (const name of Object.keys(this.avatars)) {
      const sprite = this.sprites[this.avatars[name]];
      if (sprite) {
        const rendered = this.smoothed.get(this.avatars[name]);
        const x = rendered?.x ?? sprite[1];
        const y = rendered?.y ?? sprite[2];
        ctx.fillText(name, x - 8 - offsetX, y - 16 - offsetY);
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
