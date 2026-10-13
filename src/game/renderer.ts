import type { Analyzer } from './analyzer';
import { AudioManager } from './audio';
import { DiamondFlight } from './diamondFlight';
import { describeDeath } from './deathCause';
import type { DeathCard } from './deathCause';
import { drawLamps } from './lamps';
import { HintSystem } from './hints';
import { VineField } from './vines';
import type { Look } from './look';
import { TvScreens } from './tvs';
import type { Tv } from './tvs';
import type { Lamp } from './lamps';
import { classifyImagePaths, Minimap } from './minimap';
import type { ImageKind } from './minimap';
import { glowColorForPath, NeonSprites } from './neonSprites';
import type { ActorTint, BakedSprite } from './neonSprites';
import { ParticleSystem } from './particles';
import { drawRocketLight, isRocketPath, rocketFacesLeft } from './rocketLight';
import { drawStarFire, isStarPath } from './starFire';
import { isStargatePath, stargateAngle } from './stargateSpin';
import { PlanetView } from './planet';
import { PostFx } from './postFx';
import { LocalPredictor } from './prediction';
import { SleepFaces } from './sleepFace';
import { damageStage, HEALTH_KEY } from './damage';
import { LOOK_DOWN_MAX_SCREEN_FRACTION, LookDown } from './lookDown';
import { SleepZs, SLEEPING_KEY, sleepLean } from './sleepZs';
import { BUBBLE_TOTAL_HEIGHT_PX, drawEmojiBubble, EMOJI_KEY } from './emojiBubble';
import { SpaceBackground } from './spaceBackground';
import type { TouchRect } from './spaceBackground';
import { StationBackdrop } from './stationBackdrop';
import type {
  AvatarsMap,
  BackgroundKind,
  ConnectPayload,
  IncomingSprite,
  LooksMap,
  PlanetState,
  SpritesMap,
  StoredSprite,
} from './types';

export interface RendererContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  backgroundEl: HTMLElement | null;
  scoreEl?: HTMLElement | null;
  diamondsEl?: HTMLElement | null;
  minimapCanvas?: HTMLCanvasElement | null;
  images: HTMLImageElement[];
  loginName: string;
  analyzer?: Analyzer;
}

interface SmoothedPosition {
  x: number;
  y: number;
  // First smoothing stage; x/y above are the second stage, which is what gets drawn.
  midX: number;
  midY: number;
}

type VerticalState = 'up' | 'down' | 'idle';

/**
 * What the local player's camera is doing once they have no avatar: off (alive), tracking their robot body, free
 * (dead), or free too while their own avatar sleeps where they pressed Escape.
 */
export type SpectatorMode = 'off' | 'following' | 'free' | 'asleep';

const ARROW_LEFT = 37;
const ARROW_UP = 38;
const ARROW_RIGHT = 39;
const ARROW_DOWN = 40;
const SPECTATOR_CAMERA_SPEED_PX_PER_S = 450;

// Exponential-decay smoothing time-constant applied to every sprite's rendered position, in two cascaded stages: it turns
// raw per-message snapshots (a steady glide arrives as 8px steps every ~42ms) into continuous motion between server frames
// without needing a timestamped interpolation buffer. One stage left a visible speed ripple at the step rate; two of
// them flatten it (about 80ms of lag in total). See src/game/prediction.ts for the local avatar's extra horizontal-prediction layer.
const SMOOTHING_TAU_MS = 40;
// A gap bigger than this (a wall, a push, a warp, a respawn) snaps the render position instead of sliding
// across the screen. It has to stay well above the steady lag of a fast sprite (~31px at 384px/s).
const RECONCILE_SNAP_THRESHOLD_PX = 64;
const WARP_DETECTION_THRESHOLD_PX = 64;
const AVATAR_WIDTH_PX = 48;
const AVATAR_HEIGHT_PX = 64;
// Roughly how far the head of a sleeper slumped forward sits from the centre of its feet.
const SLEEP_HEAD_SHIFT_PX = 8;
const NAME_TAG_COLOR = '#00f6ff';
// Half of a ninja star's 3-cell (24px) sprite.
const STAR_CENTER_PX = 12;

// Matches server/sprite/explosion.ts (28 grid cells of 8px); shake fades out over about two screen widths.
const EXPLOSION_SIZE_PX = 224;
const EXPLOSION_SHAKE_RANGE_PX = 1600;
// Mirrors server/session.ts; the server is authoritative, this only drives the immediate on-screen total.
const POINTS_PER_BLOCK = 20;
const SCORE_SCRAMBLE_TICKS = 6;
const SCORE_SCRAMBLE_INTERVAL_MS = 40;
const SPRITE_GLOW_BLUR_PX = 12;
const DIAMOND_SIZE_PX = 16;
// A collected diamond vanishes while overlapping the avatar, so anything gone from farther than this wasn't collected by us.
const DIAMOND_COLLECT_RANGE_PX = 120;
const DIAMOND_CATCH_UP_MS = 1500;
// Block art is 3x3 grid cells; an avatar picks up what touches its one-cell (8px) ring, and carries a block on its head.
const MANA_SIZE_PX = 24;
const TOUCH_RING_PX = 8;
const CARRY_TOLERANCE_PX = 6;
const HINT_CHECK_INTERVAL_MS = 100;

/** Mirrors js/renderer.js: draws directly to canvas every frame, bypassing React reconciliation for perf. */
export class Renderer {
  sprites: SpritesMap = {};
  avatars: AvatarsMap = {};
  looks: LooksMap = {};
  imagePaths: string[] = [];
  backgroundKind: BackgroundKind | undefined;
  lamps: Lamp[] = [];
  tvs: Tv[] = [];
  /** The green hue over the ceiling wall and the vines hanging from it, if the room has any (cosmetic; drawn right after the wall blocks). */
  vines: VineField | undefined;
  /** The shared video behind every background TV (public so e2e can check it plays). */
  readonly tvScreens = new TvScreens();
  spaceBackground: SpaceBackground | undefined;
  /** The level's current background gas giant, kept in step with the server (see setPlanet). */
  planet: PlanetView | undefined;
  score = 0;
  /** Blue diamonds this player has collected (the server owns the count; see server/session.ts). */
  diamonds = 0;
  /** What the HUD shows: trails `diamonds` until each collected diamond has flown into it. */
  shownDiamonds = 0;
  /** Called with the number of blocks that just reached the score, so it can be reported to the server. */
  onBlocksCollected: ((blocks: number) => void) | undefined;
  private scoreTarget: { x: number; y: number } | undefined;
  private diamondsTarget: { x: number; y: number } | undefined;
  private readonly diamondFlight = new DiamondFlight();
  private diamondsOwedSince: number | undefined;
  private worldWidth = 0;
  private worldHeight = 0;

  private readonly audio = new AudioManager();
  private readonly particles = new ParticleSystem();
  private readonly predictor = new LocalPredictor();
  private readonly neon = new NeonSprites();
  private readonly postFx = new PostFx();
  private imageKinds: ImageKind[] = [];
  private glowColors: (string | undefined)[] = [];
  private explosionImages = new Set<number>();
  private starImages = new Set<number>();
  private stargateImages = new Set<number>();
  private diamondImages = new Set<number>();
  private manaImages = new Set<number>();
  private scoreScrambleTimer: number | undefined;
  private readonly minimap: Minimap | undefined;
  private minimapOpen = true;

  /** Sprites a planet is swallowing, by id → how much of their size is left (1 → 0); the server owns the progress. */
  private readonly shrinks = new Map<string, number>();
  /** Avatars whose player pressed Escape or lost their connection while alive: drawn asleep, with Zs above the head. */
  readonly sleeping = new Set<string>();
  /** Avatars below full health, with their remaining health percent: drawn with wounds (see `damage.ts`). */
  readonly health = new Map<string, number>();
  /** Sprites (avatars and robots) with an emoji speech bubble up right now, by sprite id. */
  readonly emojis = new Map<string, string>();
  private readonly sleepZs = new SleepZs();
  private readonly sleepFaces = new SleepFaces();
  private readonly smoothed = new Map<string, SmoothedPosition>();
  private readonly lastY = new Map<string, number>();
  private readonly verticalState = new Map<string, VerticalState>();
  private localSpriteId: string | undefined;
  /** The robot the local player was turned into: not an avatar (so it draws as a red robot), but the camera tracks it. */
  private followSpriteId: string | undefined;
  private hasConnectedOnce = false;
  private spectator: SpectatorMode = 'off';
  /** Set by the one-shot death ping; the full refresh that follows it decides between following a robot and a free camera. */
  private died = false;
  /** Centre of the free camera, in world pixels (only meaningful while spectating freely). */
  private spectatorCamera: { x: number; y: number } | undefined;
  private lastCameraCenter: { x: number; y: number } | undefined;
  private readonly heldArrows = new Set<number>();
  /** Camera peek below the avatar while Down is held (purely visual). */
  private readonly lookDown = new LookDown();
  /** First-run control prompts (see hints.ts); public so the React layer can show them and e2e can read them. */
  readonly hints = new HintSystem();
  private lastHintCheck = 0;
  /** Called whenever the spectator mode changes, so the UI can show/hide its message. */
  onSpectatorChange: ((mode: SpectatorMode) => void) | undefined;
  /** Told what killed the local avatar (null when the server named no cause), the moment the death ping arrives. */
  onDeathCard: ((card: DeathCard | null) => void) | undefined;

  private me: StoredSprite | undefined;
  private offsetX = 0;
  private offsetY = 0;
  private readonly windowWidth = window.innerWidth;
  private readonly windowHeight = window.innerHeight;

  private lastFrameTime = performance.now();
  private lastDtMs = 0;
  private rafHandle: number | undefined;
  private stopped = false;
  private readonly onVisibilityChange = (): void => {
    this.minimap?.setPaused(document.hidden, performance.now());
  };

  private shakeUntil = 0;
  private shakeMagnitude = 0;
  private flashUntil = 0;
  private flashColor = '';

  constructor(private readonly context: RendererContext) {
    if (context.minimapCanvas) {
      this.minimap = new Minimap(context.minimapCanvas);
      this.minimap.setPaused(document.hidden, performance.now());
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.updateScoreDisplay();
    this.updateDiamondsDisplay();
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  private updateScoreDisplay(): void {
    const { scoreEl } = this.context;
    if (!scoreEl) return;

    const text = String(this.score);
    if (this.scoreScrambleTimer !== undefined) window.clearInterval(this.scoreScrambleTimer);
    this.scoreScrambleTimer = undefined;

    if (!scoreEl.textContent || scoreEl.textContent === text) {
      scoreEl.textContent = text;
    } else {
      // Brief "decrypting" digit scramble that always settles on the exact total.
      let ticks = 0;
      this.scoreScrambleTimer = window.setInterval(() => {
        ticks++;
        if (ticks >= SCORE_SCRAMBLE_TICKS) {
          window.clearInterval(this.scoreScrambleTimer);
          this.scoreScrambleTimer = undefined;
          scoreEl.textContent = text;
        } else {
          scoreEl.textContent = text.replace(/\d/g, () => String(Math.floor(Math.random() * 10)));
        }
      }, SCORE_SCRAMBLE_INTERVAL_MS);
    }

    const rect = scoreEl.getBoundingClientRect();
    this.scoreTarget = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  private updateDiamondsDisplay(): void {
    const { diamondsEl } = this.context;
    if (!diamondsEl) return;

    diamondsEl.textContent = String(this.shownDiamonds);
    const rect = diamondsEl.getBoundingClientRect();
    this.diamondsTarget = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /**
   * The server collected diamonds for this player (a separate one-shot message, like the planet's). The HUD doesn't
   * jump: each diamond that visibly flew into it (see load()) bumps it as it arrives.
   */
  /** Players changed their colours: a one-shot server message, separate from the flat redraw frames. */
  setLooks(looks: LooksMap): void {
    this.looks = looks;
  }

  setDiamonds(diamonds: number): void {
    this.diamonds = diamonds;
    if (diamonds < this.shownDiamonds) {
      this.shownDiamonds = diamonds;
      this.updateDiamondsDisplay();
    }
    this.diamondsOwedSince = this.shownDiamonds < diamonds ? (this.diamondsOwedSince ?? performance.now()) : undefined;
  }

  /** Counts the diamonds that just reached the HUD; if none ever flew (e.g. out of sight), catches up after a moment. */
  private advanceDiamonds(now: number, drawOffsetX: number, drawOffsetY: number): void {
    const worldTarget = this.diamondsTarget && { x: this.diamondsTarget.x + drawOffsetX, y: this.diamondsTarget.y + drawOffsetY };
    const arrived = this.diamondFlight.update(this.lastDtMs, worldTarget);
    let shown = Math.min(this.diamonds, this.shownDiamonds + arrived);

    const stalled = this.diamondsOwedSince !== undefined && now - this.diamondsOwedSince > DIAMOND_CATCH_UP_MS;
    if (stalled && this.diamondFlight.flying.length === 0) shown = this.diamonds;

    if (shown !== this.shownDiamonds) {
      if (shown > this.shownDiamonds) this.audio.play('manaPickup');
      this.shownDiamonds = shown;
      this.diamondsOwedSince = shown < this.diamonds ? now : undefined;
      this.updateDiamondsDisplay();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.rafHandle !== undefined) cancelAnimationFrame(this.rafHandle);
    if (this.scoreScrambleTimer !== undefined) window.clearInterval(this.scoreScrambleTimer);
    if (this.minimap) document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.audio.dispose();
    this.tvScreens.dispose();
  }

  setMinimapOpen(open: boolean): void {
    this.minimapOpen = open;
  }

  getPlayerOffset(): { offsetX: number; offsetY: number; me: StoredSprite | undefined } {
    return { offsetX: this.offsetX, offsetY: this.offsetY, me: this.me };
  }

  /** Forwards raw input so the local-avatar predictor can move the instant a key is pressed (see prediction.ts). */
  onLocalKey(keyCode: number, down: boolean): void {
    // A sleeping avatar takes no orders, so don't move it on screen either; releases still go through.
    if (!(down && this.spectator === 'asleep')) this.predictor.setKey(keyCode, down);

    if (keyCode === ARROW_DOWN) this.lookDown.setHeld(down && this.spectator === 'off');

    if (keyCode >= ARROW_LEFT && keyCode <= ARROW_DOWN) {
      if (!down) this.heldArrows.delete(keyCode);
      else if (this.spectator !== 'off') {
        this.heldArrows.add(keyCode);
        if (this.spectator === 'following') this.beginFreeCamera(); // an arrow key releases the camera from the robot
      }
    }

    if (this.spectator === 'off') this.hints.onKey(keyCode, down);

    if (down && this.spectator === 'off') {
      if (keyCode === 32) this.audio.play('manaPickup');
      else if (keyCode === 40) this.audio.play('manaDrop');
    }
  }

  /** One-shot server ping sent the instant the local avatar's session unplugs — see server/socketHub.ts. */
  onLocalAvatarDeath(cause?: unknown): void {
    this.died = true;
    this.onDeathCard?.(describeDeath(cause));
    this.audio.play('death');
    this.triggerShake(400, 10);
    this.triggerFlash(350, 'rgba(200, 30, 20, 0.35)');
    this.postFx.triggerGlitch(performance.now(), 450);

    if (this.me) {
      this.particles.spawnImpact(this.me[1] + 24, this.me[2] + 32, 18);
    }
  }

  loadImages(): void {
    this.neon.clear();
    this.imageKinds = classifyImagePaths(this.imagePaths);
    this.glowColors = this.imagePaths.map(glowColorForPath);
    this.explosionImages = new Set(
      this.imagePaths.flatMap((path, index) => (path.includes('/effects/explosion/') ? [index] : [])),
    );
    this.starImages = new Set(this.imagePaths.flatMap((path, index) => (isStarPath(path) ? [index] : [])));
    this.stargateImages = new Set(this.imagePaths.flatMap((path, index) => (isStargatePath(path) ? [index] : [])));
    this.diamondImages = new Set(
      this.imagePaths.flatMap((path, index) => (path.includes('/effects/diamond') ? [index] : [])),
    );
    this.manaImages = new Set(
      this.imagePaths.flatMap((path, index) => (path.includes('/mana/') && !path.includes('/fire/') ? [index] : [])),
    );

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
    this.shrinks.clear();
    this.sleeping.clear();
    this.health.clear();
    this.emojis.clear();
    for (const [spriteId, sprite] of Object.entries(data.sprites)) {
      const extraInfo = (sprite as IncomingSprite)[3] as Record<string, unknown> | undefined;
      if (extraInfo?.[SLEEPING_KEY]) this.sleeping.add(spriteId);
      if (typeof extraInfo?.[HEALTH_KEY] === 'number') this.health.set(spriteId, extraInfo[HEALTH_KEY]);
      if (typeof extraInfo?.[EMOJI_KEY] === 'string') this.emojis.set(spriteId, extraInfo[EMOJI_KEY]);
    }
    // The server sends numeric sprite ids here but string ids (object keys) in redraw frames; normalize so the
    // strict === comparisons against sprite-map keys (local avatar, shard collection, minimap) always agree.
    this.avatars = Object.fromEntries(Object.entries(data.avatars).map(([name, id]) => [name, String(id)]));
    this.imagePaths = data.imagePaths;
    this.looks = data.looks ?? {};
    this.setBackground(data.background, data.worldWidth, data.worldHeight);
    this.lamps = data.lamps ?? [];
    this.tvs = data.tvs ?? [];
    this.vines = data.vines ? new VineField(data.vines) : undefined;
    this.setPlanet(data.planet);
    this.score = data.score ?? 0;
    this.updateScoreDisplay();
    this.diamonds = data.diamonds ?? 0;
    this.shownDiamonds = this.diamonds;
    this.diamondsOwedSince = undefined;
    this.diamondFlight.flying = [];
    this.updateDiamondsDisplay();
    this.minimap?.setImagePaths(data.imagePaths);
    this.loadImages();

    const loginSpriteIdAfter = this.avatars[this.context.loginName];
    const after = loginSpriteIdAfter ? this.sprites[loginSpriteIdAfter] : undefined;

    if (after && loginSpriteIdAfter !== this.localSpriteId) {
      // Respawn/relogin under a new avatar instance: start prediction fresh at the new position.
      this.smoothed.delete(loginSpriteIdAfter);
    }
    this.localSpriteId = loginSpriteIdAfter;
    this.followSpriteId = data.following == null ? undefined : String(data.following);
    this.updateSpectator(data.following != null, after !== undefined);

    if (after) {
      const dx = after[1] - (before?.[1] ?? after[1]);
      const dy = after[2] - (before?.[2] ?? after[2]);

      if (this.hasConnectedOnce && before && Math.hypot(dx, dy) > WARP_DETECTION_THRESHOLD_PX) {
        this.audio.play('portalWarp');
        this.particles.spawnWarp(after[1] + 24, after[2] + 32);
        this.postFx.triggerGlitch(performance.now(), 350);
      }

      this.predictor.reset(after[1]);
    }

    this.hasConnectedOnce = true;
  }

  /** Public game state at this instant, used as the starting point of a debug recording. */
  snapshot(): Record<string, unknown> {
    return {
      sprites: this.sprites,
      avatars: this.avatars,
      imagePaths: this.imagePaths,
      localSpriteId: this.localSpriteId,
      followSpriteId: this.followSpriteId,
      background: this.backgroundKind,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      score: this.score,
      diamonds: this.diamonds,
    };
  }

  get spectatorMode(): SpectatorMode {
    return this.spectator;
  }

  private setSpectator(mode: SpectatorMode): void {
    if (mode === this.spectator) return;
    this.spectator = mode;
    this.onSpectatorChange?.(mode);
  }

  /** With no avatar the camera either tracks the player's robot body or, otherwise, becomes a free camera where they died. */
  private updateSpectator(hasRobotBody: boolean, hasAvatar: boolean): void {
    if (hasAvatar) {
      this.died = false;
      const local = this.avatars[this.context.loginName];
      if (local !== undefined && this.sleeping.has(local)) {
        if (this.spectator !== 'asleep') this.beginFreeCamera('asleep');
      } else {
        this.spectatorCamera = undefined;
        this.heldArrows.clear();
        this.setSpectator('off');
      }
    } else if (hasRobotBody) {
      this.died = false;
      if (this.spectator !== 'free') this.setSpectator('following');
    } else if (this.died) {
      this.died = false;
      this.beginFreeCamera();
    }
  }

  private beginFreeCamera(mode: 'free' | 'asleep' = 'free'): void {
    this.spectatorCamera = { ...(this.lastCameraCenter ?? { x: this.worldWidth / 2, y: this.worldHeight / 2 }) };
    this.setSpectator(mode);
  }

  /** Whether Escape should put the local (living) avatar to sleep, rather than leave: it is alive and not yet asleep. */
  canFallAsleep(): boolean {
    const local = this.avatars[this.context.loginName];
    return this.spectator === 'off' && local !== undefined && local in this.sprites;
  }

  /** The server flags the local avatar asleep (Escape, or after the fact): the player becomes a spectator of it. */
  private syncAsleepSpectator(): void {
    const local = this.avatars[this.context.loginName];
    if (local === undefined || !(local in this.sprites)) return;
    if (this.sleeping.has(local) !== (this.spectator === 'asleep')) this.updateSpectator(false, true);
  }

  private advanceSpectatorCamera(dtMs: number): void {
    const camera = this.spectatorCamera;
    if ((this.spectator !== 'free' && this.spectator !== 'asleep') || !camera) return;

    const step = (SPECTATOR_CAMERA_SPEED_PX_PER_S * dtMs) / 1000;
    if (this.heldArrows.has(ARROW_LEFT)) camera.x -= step;
    if (this.heldArrows.has(ARROW_RIGHT)) camera.x += step;
    if (this.heldArrows.has(ARROW_UP)) camera.y -= step;
    if (this.heldArrows.has(ARROW_DOWN)) camera.y += step;

    if (this.worldWidth > 0) camera.x = Math.min(Math.max(camera.x, 0), this.worldWidth);
    if (this.worldHeight > 0) camera.y = Math.min(Math.max(camera.y, 0), this.worldHeight);
  }

  /** Planet updates arrive as their own messages; applied synchronously so state never waits on the draw loop. */
  setPlanet(state: PlanetState | null | undefined): void {
    if (!state) {
      this.planet = undefined;
    } else if (this.planet) {
      this.planet.sync(state);
    } else {
      this.planet = new PlanetView(state);
    }
  }

  render(data: Record<string, unknown>): void {
    const spriteIds = Object.keys(data);
    if (spriteIds.length === 0) return;

    this.load(data, spriteIds);

    if (this.context.analyzer) {
      this.context.analyzer.redraws++;
      this.context.analyzer.drawTime = Date.now() - this.context.analyzer.connectionTime;
    }
  }

  /** Whether the ambient music is playing (public so e2e can check it stops while the level is frozen). */
  get isMusicPlaying(): boolean {
    return this.audio.isAmbientPlaying;
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
        const removed = this.sprites[spriteId];
        if (removed && this.diamondImages.has(removed[0]) && !this.shrinks.has(spriteId)) this.onDiamondRemoved(spriteId, removed, localSpriteId);
        if (removed && this.minimap?.kindOf(removed[0]) === 'wall') this.minimap.invalidateWalls();
        delete this.sprites[spriteId];
        this.shrinks.delete(spriteId);
        this.sleeping.delete(spriteId);
        this.health.delete(spriteId);
        this.emojis.delete(spriteId);
        this.smoothed.delete(spriteId);
        this.lastY.delete(spriteId);
        this.verticalState.delete(spriteId);
        continue;
      }

      const [imageIndex, x, y, extraInfo] = newSprite as [number, number, number, Record<string, unknown>?];
      const previousX = this.sprites[spriteId]?.[1];
      if (previousX === undefined && this.minimap?.kindOf(imageIndex) === 'wall') this.minimap.invalidateWalls();
      this.sprites[spriteId] = [imageIndex, x, y];

      if (avatarSpriteIds.has(spriteId)) {
        this.detectVerticalTransition(spriteId, x, y, previousX, spriteId === localSpriteId);
      }

      // Only avatars ever send the flag, so a frame without it means the sleeper woke up.
      if (extraInfo?.[SLEEPING_KEY]) this.sleeping.add(spriteId);
      else this.sleeping.delete(spriteId);

      // Likewise, an avatar frame without the health key is back at full health.
      const health = extraInfo?.[HEALTH_KEY];
      if (typeof health === 'number') this.health.set(spriteId, health);
      else this.health.delete(spriteId);

      // And an avatar frame without the emoji key means its speech bubble is gone.
      const emoji = extraInfo?.[EMOJI_KEY];
      if (typeof emoji === 'string') this.emojis.set(spriteId, emoji);
      else this.emojis.delete(spriteId);

      if (extraInfo) {
        const shrink = extraInfo['2'] as number | undefined;
        if (shrink !== undefined) this.shrinks.set(spriteId, shrink);

        const avatarName = extraInfo['0'] as string | undefined;
        if (avatarName) {
          this.avatars[avatarName] = spriteId;
        }

      }

      // A robot (an actor that never sends a name) showing up in a redraw frame has just warped into the room.
      if (previousX === undefined && !extraInfo?.['0'] && this.minimap?.kindOf(imageIndex) === 'actor' && !avatarSpriteIds.has(spriteId)) {
        this.particles.spawnWarp(x + 24, y + 32);
      }

      // A burning star sheds embers every update, so they hang along the whole arc it flew.
      if (this.starImages.has(imageIndex)) this.particles.spawnSparks(x + STAR_CENTER_PX, y + STAR_CENTER_PX);

      if (previousX === undefined && this.explosionImages.has(imageIndex)) {
        this.onExplosion(x, y, this.imagePaths[imageIndex]?.includes('/explosion/small') ? EXPLOSION_SIZE_PX / 2 : EXPLOSION_SIZE_PX);
      }
    }

    this.syncAsleepSpectator();
  }

  /** A block blew up: a bang, a burst of sparks and a little shake, all stronger the closer it is to the camera. */
  /** A ninja star's smaller fireball (its art is smaller) gets a proportionally smaller burst and shake. */
  private onExplosion(x: number, y: number, sizePx: number): void {
    const centerX = x + sizePx / 2;
    const centerY = y + sizePx / 2;
    const scale = sizePx / EXPLOSION_SIZE_PX;
    this.audio.play('missileImpact');
    this.particles.spawnImpact(centerX, centerY, Math.round(24 * scale));

    const distance = this.me ? Math.hypot(centerX - this.me[1], centerY - this.me[2]) : Infinity;
    if (distance < EXPLOSION_SHAKE_RANGE_PX) this.triggerShake(300, 8 * scale * (1 - distance / EXPLOSION_SHAKE_RANGE_PX));
  }

  /** A diamond vanished right next to the local avatar: that's it being collected, so send it flying to the HUD. */
  private onDiamondRemoved(spriteId: string, removed: StoredSprite, localSpriteId: string | undefined): void {
    const local = localSpriteId ? this.sprites[localSpriteId] : undefined;
    if (!local) return;

    const rendered = this.smoothed.get(spriteId);
    const x = (rendered?.x ?? removed[1]) + DIAMOND_SIZE_PX / 2;
    const y = (rendered?.y ?? removed[2]) + DIAMOND_SIZE_PX / 2;
    if (Math.hypot(x - (local[1] + AVATAR_WIDTH_PX / 2), y - (local[2] + AVATAR_HEIGHT_PX / 2)) > DIAMOND_COLLECT_RANGE_PX) return;

    this.diamondFlight.spawn(x, y);
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
    this.lastDtMs = dtMs;
    this.particles.update(dtMs);
    this.advanceRenderPositions(dtMs);
    this.updateSleepZs(dtMs);
    this.advanceSpectatorCamera(dtMs);
    this.updateHints(now);
    this.draw(now);

    this.rafHandle = requestAnimationFrame(this.tick);
  };

  /** Looks at the raw server positions around the local avatar: is it touching a block, or carrying one on its head? */
  private updateHints(now: number): void {
    if (now - this.lastHintCheck < HINT_CHECK_INTERVAL_MS) return;
    this.lastHintCheck = now;

    const spriteId = this.avatars[this.context.loginName];
    const avatar = spriteId ? this.sprites[spriteId] : undefined;
    if (!avatar || this.spectator !== 'off' || this.shrinks.has(spriteId)) {
      this.hints.update({ alive: false, touchingBlock: false, carryingBlock: false });
      return;
    }

    const [, avatarX, avatarY] = avatar;
    let touchingBlock = false;
    let carryingBlock = false;
    for (const [imageIndex, x, y] of Object.values(this.sprites)) {
      if (!this.manaImages.has(imageIndex)) continue;

      // A carried block sits on the avatar's head, one cell in from its left edge (see Avatar.getHandledManaX/Y).
      if (Math.abs(x - (avatarX + TOUCH_RING_PX)) <= CARRY_TOLERANCE_PX && Math.abs(y + MANA_SIZE_PX - avatarY) <= CARRY_TOLERANCE_PX) {
        carryingBlock = true;
      } else if (
        x < avatarX + AVATAR_WIDTH_PX + TOUCH_RING_PX &&
        x + MANA_SIZE_PX > avatarX - TOUCH_RING_PX &&
        y < avatarY + AVATAR_HEIGHT_PX + TOUCH_RING_PX &&
        y + MANA_SIZE_PX > avatarY - TOUCH_RING_PX
      ) {
        touchingBlock = true;
      }
    }
    this.hints.update({ alive: true, touchingBlock, carryingBlock });
  }

  private advanceRenderPositions(dtMs: number): void {
    const factor = 1 - Math.exp(-dtMs / SMOOTHING_TAU_MS);

    for (const spriteId of Object.keys(this.sprites)) {
      const sprite = this.sprites[spriteId];
      let targetX = sprite[1];
      const targetY = sprite[2];

      // Once a planet is swallowing the local avatar the server alone steers it; don't predict its keypresses.
      if (spriteId === this.localSpriteId && !this.shrinks.has(spriteId) && !this.sleeping.has(spriteId)) {
        targetX = this.predictor.getBlendedX(targetX, dtMs);
      }

      const current = this.smoothed.get(spriteId);
      if (!current) {
        this.smoothed.set(spriteId, { x: targetX, y: targetY, midX: targetX, midY: targetY });
        continue;
      }

      const dx = targetX - current.x;
      const dy = targetY - current.y;

      if (Math.abs(dx) > RECONCILE_SNAP_THRESHOLD_PX || Math.abs(dy) > RECONCILE_SNAP_THRESHOLD_PX) {
        current.x = current.midX = targetX;
        current.y = current.midY = targetY;
      } else {
        current.midX += (targetX - current.midX) * factor;
        current.midY += (targetY - current.midY) * factor;
        current.x += (current.midX - current.x) * factor;
        current.y += (current.midY - current.y) * factor;
      }
    }

    for (const spriteId of this.smoothed.keys()) {
      if (!(spriteId in this.sprites)) this.smoothed.delete(spriteId);
    }
  }

  private updateSleepZs(dtMs: number): void {
    const heads = new Map<string, { x: number; y: number }>();
    for (const spriteId of this.sleeping) {
      const sprite = this.sprites[spriteId];
      if (!sprite) continue;
      const rendered = this.smoothed.get(spriteId);
      const width = this.context.images[sprite[0]]?.width || AVATAR_WIDTH_PX;
      // Offset to where a leaning sleeper's head ends up, slightly forward of its feet.
      const lean = this.isFacingLeft(sprite[0]) ? -SLEEP_HEAD_SHIFT_PX : SLEEP_HEAD_SHIFT_PX;
      heads.set(spriteId, { x: (rendered?.x ?? sprite[1]) + width / 2 + lean, y: (rendered?.y ?? sprite[2]) + 4 });
    }

    this.sleepZs.update(dtMs, heads);
  }

  private isFacingLeft(imageIndex: number): boolean {
    return /L\.png$/.test(this.imagePaths[imageIndex] ?? '');
  }

  private setBackground(kind: BackgroundKind, worldWidth: number, worldHeight: number): void {
    const { canvas, backgroundEl } = this.context;

    if (kind !== this.backgroundKind || worldWidth !== this.worldWidth || worldHeight !== this.worldHeight) {
      this.backgroundKind = kind;
      this.worldWidth = worldWidth;
      this.worldHeight = worldHeight;
      this.spaceBackground =
        kind === 'space' || kind === 'station'
          ? new SpaceBackground(worldWidth, worldHeight, canvas.width, canvas.height)
          : undefined;
      if (this.spaceBackground && kind === 'station') {
        this.spaceBackground.backdrop = new StationBackdrop(canvas.width, canvas.height);
      }
    }

    // The temple image is a DOM layer behind the canvas; the space backdrop is drawn on the canvas itself.
    if (backgroundEl) backgroundEl.style.display = kind === 'temple' ? 'block' : 'none';
  }

  private draw(now: number): void {
    const { ctx, canvas, backgroundEl } = this.context;

    if (!this.spaceBackground) {
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

    if (backgroundEl && this.backgroundKind === 'temple') {
      backgroundEl.style.left = `${(drawOffsetX / 10) * -1 - 55}px`;
      backgroundEl.style.top = `${(drawOffsetY / 50) * -1 - 20}px`;
    }

    if (this.spaceBackground) {
      this.drawSpaceBackground(now, drawOffsetX, drawOffsetY);
    }

    drawLamps(ctx, this.lamps, drawOffsetX, drawOffsetY, canvas.width, canvas.height, now);
    // After the lamps: screens emit their own light, so a beam's additive glow mustn't tint them (the ad card is black).
    this.tvScreens.draw(ctx, this.tvs, drawOffsetX, drawOffsetY, canvas.width, canvas.height, now);

    this.drawSprites(drawOffsetX, drawOffsetY);
    this.spaceBackground?.drawCollectingShards(ctx, drawOffsetX, drawOffsetY);
    this.advanceDiamonds(now, drawOffsetX, drawOffsetY);
    this.diamondFlight.draw(ctx, drawOffsetX, drawOffsetY);
    this.particles.draw(ctx, drawOffsetX, drawOffsetY);
    this.sleepZs.draw(ctx, drawOffsetX, drawOffsetY);

    if (now < this.flashUntil) {
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    this.drawEmojiBubbles(drawOffsetX, drawOffsetY);
    this.drawAvatarsNames(drawOffsetX, drawOffsetY);
    this.postFx.apply(ctx, canvas, now);
    this.drawMinimap(now);
  }

  /** Every avatar (local or remote) shatters the world-space pieces it overlaps; the backdrop never affects gameplay. */
  private drawSpaceBackground(now: number, drawOffsetX: number, drawOffsetY: number): void {
    const space = this.spaceBackground;
    if (!space) return;

    space.planet = this.planet;

    const touchers: TouchRect[] = [];
    for (const spriteId of Object.values(this.avatars)) {
      const sprite = this.sprites[spriteId];
      if (!sprite) continue;
      const rendered = this.smoothed.get(spriteId);
      touchers.push({
        x: rendered?.x ?? sprite[1],
        y: rendered?.y ?? sprite[2],
        width: AVATAR_WIDTH_PX,
        height: AVATAR_HEIGHT_PX,
        collects: spriteId === this.localSpriteId,
      });
    }

    // The score HUD is in screen space while shards live in the world, so convert the target by the camera offset.
    const worldTarget = this.scoreTarget && { x: this.scoreTarget.x + drawOffsetX, y: this.scoreTarget.y + drawOffsetY };
    const collected = space.update(this.lastDtMs, touchers, worldTarget);
    if (collected > 0) this.collectBlocks(collected);

    space.draw(this.context.ctx, drawOffsetX, drawOffsetY, now);
  }

  private collectBlocks(blocks: number): void {
    this.score += blocks * POINTS_PER_BLOCK;
    this.updateScoreDisplay();
    this.onBlocksCollected?.(blocks);
  }

  private drawMinimap(now: number): void {
    if (!this.minimap || !this.minimapOpen) return;

    this.minimap.draw({
      sprites: this.sprites,
      avatarSpriteIds: new Set(Object.values(this.avatars)),
      localSpriteId: this.localSpriteId,
      planet: this.planet,
      positionOf: (spriteId) => {
        const rendered = this.smoothed.get(spriteId);
        const sprite = this.sprites[spriteId];
        return { x: rendered?.x ?? sprite[1], y: rendered?.y ?? sprite[2] };
      },
      now,
    });
  }

  private computeCameraOffset(): void {
    this.offsetX = 0;
    this.offsetY = 0;

    if (this.spectator !== 'off') this.lookDown.reset();

    if ((this.spectator === 'free' || this.spectator === 'asleep') && this.spectatorCamera) {
      this.me = undefined;
      this.centerCameraOn(this.spectatorCamera.x, this.spectatorCamera.y);
      return;
    }

    const cameraSpriteId = this.avatars[this.context.loginName] ?? this.followSpriteId;
    this.me = cameraSpriteId ? this.sprites[cameraSpriteId] : undefined;
    if (!this.me) {
      // The robot being followed is gone: stay where the camera was instead of jumping to the world origin.
      if (this.spectator === 'following') {
        this.beginFreeCamera();
        this.computeCameraOffset();
      }
      return;
    }

    const rendered = (cameraSpriteId && this.smoothed.get(cameraSpriteId)) || undefined;
    const meX = rendered?.x ?? this.me[1];
    const meY = rendered?.y ?? this.me[2];

    this.centerCameraOn(meX + 24, meY + 16);
    if (this.spectator === 'off') this.offsetY += this.lookDown.update(this.lastDtMs, this.windowHeight * LOOK_DOWN_MAX_SCREEN_FRACTION);
  }

  private centerCameraOn(x: number, y: number): void {
    this.lastCameraCenter = { x, y };
    this.offsetX = x - this.windowWidth / 2;
    this.offsetY = y - this.windowHeight / 2;
  }

  private drawSprites(offsetX: number, offsetY: number): void {
    const playerSpriteIds = new Set(Object.values(this.avatars));
    const looksBySprite = new Map<string, Look>();
    for (const [name, [headband, belt]] of Object.entries(this.looks)) {
      const spriteId = this.avatars[name];
      if (spriteId !== undefined) looksBySprite.set(spriteId, { headband, belt });
    }

    // Wall blocks first, then the green wall hue and hanging vines, then everything else (avatars stay on top of the vines).
    const isWall = (spriteId: string): boolean => this.imageKinds[this.sprites[spriteId][0]] === 'wall';
    const spriteIds = Object.keys(this.sprites);
    const draw = (spriteId: string): void => this.drawSprite(spriteId, offsetX, offsetY, playerSpriteIds, looksBySprite);

    spriteIds.filter(isWall).forEach(draw);
    this.drawVines(offsetX, offsetY);
    spriteIds.filter((spriteId) => !isWall(spriteId)).forEach(draw);
  }

  private drawVines(offsetX: number, offsetY: number): void {
    const { ctx, canvas } = this.context;
    this.vines?.draw(ctx, offsetX, offsetY, canvas.width, canvas.height, performance.now());
  }

  private drawSprite(spriteId: string, offsetX: number, offsetY: number, playerSpriteIds: Set<string>, looksBySprite: Map<string, Look>): void {
    const { ctx } = this.context;
    const sprite = this.sprites[spriteId];
    const index = sprite[0];
    const image = this.context.images[index];
    if (!image) return;

    const rendered = this.smoothed.get(spriteId);
    const x = (rendered?.x ?? sprite[1]) - offsetX;
    const y = (rendered?.y ?? sprite[2]) - offsetY;

    const shrink = this.shrinks.get(spriteId);
    if (shrink !== undefined) {
      if (shrink <= 0.02) return;
      const centerX = x + image.width / 2;
      const centerY = y + image.height / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(shrink, shrink);
      ctx.translate(-centerX, -centerY);
    }

    const asleep = this.sleeping.has(spriteId);
    if (asleep) {
      // Slump forward around the feet, breathing slowly.
      const feetX = x + image.width / 2;
      const feetY = y + image.height;
      ctx.save();
      ctx.translate(feetX, feetY);
      ctx.rotate(sleepLean(this.isFacingLeft(index), performance.now()));
      ctx.translate(-feetX, -feetY);
    }

    const kind = this.imageKinds[index];
    let baked: BakedSprite | undefined;
    if (kind === 'wall') {
      baked = this.neon.wall(index, image);
    } else if (kind === 'actor') {
      const tint: ActorTint =
        spriteId === this.localSpriteId ? 'local' : playerSpriteIds.has(spriteId) ? 'player' : 'robot';
      baked = this.neon.actor(index, image, tint, looksBySprite.get(spriteId), damageStage(this.health.get(spriteId) ?? 100));
    }

    const spinning = this.stargateImages.has(index);
    if (spinning) {
      const centerX = x + image.width / 2;
      const centerY = y + image.height / 2;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(stargateAngle(performance.now()));
      ctx.translate(-centerX, -centerY);
    }

    if (baked) {
      ctx.drawImage(baked.source, x - baked.pad, y - baked.pad);
    } else {
      const glow = this.glowColors[index];
      if (glow) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = SPRITE_GLOW_BLUR_PX;
      }
      ctx.drawImage(image, x, y);
      if (glow) ctx.shadowBlur = 0;
    }

    if (spinning) ctx.restore();

    const path = this.imagePaths[index];
    if (path && isRocketPath(path)) {
      drawRocketLight(ctx, x, y, image.width, image.height, rocketFacesLeft(path), performance.now());
    }

    if (this.starImages.has(index)) drawStarFire(ctx, x, y, image.width, image.height, performance.now(), Number(spriteId) || 0);

    if (asleep) {
      this.sleepFaces.drawClosedEyes(ctx, image, x, y);
      ctx.restore();
    }
    if (shrink !== undefined) ctx.restore();
  }

  /** Each speech bubble sits right on top of its sprite's head (avatars and robots alike). */
  private drawEmojiBubbles(offsetX: number, offsetY: number): void {
    const { ctx } = this.context;

    for (const [spriteId, emoji] of this.emojis) {
      const sprite = this.sprites[spriteId];
      if (!sprite || this.shrinks.has(spriteId)) continue;

      const rendered = this.smoothed.get(spriteId);
      const width = this.context.images[sprite[0]]?.width || AVATAR_WIDTH_PX;
      drawEmojiBubble(ctx, emoji, (rendered?.x ?? sprite[1]) + width / 2 - offsetX, (rendered?.y ?? sprite[2]) - offsetY);
    }
  }

  private drawAvatarsNames(offsetX: number, offsetY: number): void {
    const { ctx } = this.context;
    ctx.fillStyle = NAME_TAG_COLOR;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';

    for (const name of Object.keys(this.avatars)) {
      const sprite = this.sprites[this.avatars[name]];
      if (sprite && this.shrinks.has(this.avatars[name])) continue;
      if (sprite) {
        const rendered = this.smoothed.get(this.avatars[name]);
        const x = rendered?.x ?? sprite[1];
        const y = rendered?.y ?? sprite[2];
        const width = this.context.images[sprite[0]]?.width || AVATAR_WIDTH_PX;
        const tagX = x + width / 2 - offsetX;
        const bubbleLift = this.emojis.has(this.avatars[name]) ? BUBBLE_TOTAL_HEIGHT_PX : 0; // the name rides above its bubble.
        const tagY = y - 8 - bubbleLift - offsetY;
        ctx.strokeText(name, tagX, tagY);
        ctx.fillText(name, tagX, tagY);
      } else {
        delete this.avatars[name];
      }
    }

    ctx.textAlign = 'start';
  }
}
