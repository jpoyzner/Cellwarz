import { Minimap } from './minimap';
import type { PlanetState, SpritesMap } from './types';

const RECONNECT_DELAY_MS = 2000;
const DELETED_CODE = -1;
const AVATAR_NAME_KEY = '0';

export interface RadarCounts {
  pilots: number;
  robots: number;
}

/**
 * The login room's live radar: a spectator-only connection to the main room (no avatar, no login) feeding the same
 * minimap the game uses, so players can see the action before they teleport in. It also tells the login room which
 * names currently have a living avatar (what "Wake up" needs).
 */
export class RadarPreview {
  sprites: SpritesMap = {};
  /** Player name -> sprite id, as in the game's Renderer (robots never send a name). */
  avatars: Record<string, string> = {};
  planet: PlanetState | undefined;

  private readonly minimap: Minimap;
  private connection: WebSocket | undefined;
  private frame = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private planetReceivedAt = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.minimap = new Minimap(canvas);
    this.minimap.setPaused(document.hidden, performance.now());
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onVisibilityChange = () => {
    this.minimap.setPaused(document.hidden, performance.now());
  };

  start(): void {
    this.stopped = false;
    this.connect();
    const loop = () => {
      this.draw(performance.now());
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.frame);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    const connection = this.connection;
    this.connection = undefined;
    connection?.close();
  }

  private connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const connection = new WebSocket(`${protocol}//${window.location.host}/socketrefresh`);
    this.connection = connection;

    connection.onopen = () => connection.send(JSON.stringify({ connect: true, spectate: true }));
    connection.onmessage = (event: MessageEvent<string>) => this.handleMessage(JSON.parse(event.data));
    connection.onerror = () => connection.close();
    connection.onclose = () => {
      if (this.stopped || this.connection !== connection) return;
      this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    };
  }

  /** Public so unit tests can feed it the server's messages directly. */
  handleMessage(data: Record<string, unknown>): void {
    if (data.connect) {
      this.applyFullState(data);
    } else if ('planet' in data) {
      this.setPlanet(data.planet as PlanetState | null);
    } else if (!('looks' in data) && !('diamonds' in data) && !data.died) {
      this.applyFrame(data);
    }
  }

  private applyFullState(data: Record<string, unknown>): void {
    this.sprites = data.sprites as SpritesMap;
    // The server sends numeric ids here but string ids (object keys) in redraw frames; normalize them.
    this.avatars = Object.fromEntries(
      Object.entries(data.avatars as Record<string, number | string>).map(([name, id]) => [name, String(id)]),
    );
    this.minimap.setImagePaths(data.imagePaths as string[]);
    this.minimap.invalidateWalls();
    this.setPlanet((data.planet as PlanetState | null | undefined) ?? null);
  }

  private setPlanet(planet: PlanetState | null): void {
    this.planet = planet ?? undefined;
    this.planetReceivedAt = performance.now();
  }

  private applyFrame(data: Record<string, unknown>): void {
    for (const [spriteId, entry] of Object.entries(data)) {
      const sprite = entry as [number, number?, number?, Record<string, unknown>?];

      if (sprite[0] === DELETED_CODE) {
        const removed = this.sprites[spriteId];
        if (removed && this.minimap.kindOf(removed[0]) === 'wall') this.minimap.invalidateWalls();
        delete this.sprites[spriteId];
        for (const name of Object.keys(this.avatars)) {
          if (this.avatars[name] === spriteId) delete this.avatars[name];
        }
        continue;
      }

      const [imageIndex, x, y, extraInfo] = sprite as [number, number, number, Record<string, unknown>?];
      if (this.sprites[spriteId] === undefined && this.minimap.kindOf(imageIndex) === 'wall') this.minimap.invalidateWalls();
      this.sprites[spriteId] = [imageIndex, x, y];

      const name = extraInfo?.[AVATAR_NAME_KEY] as string | undefined;
      if (name) this.avatars[name] = spriteId;
    }
  }

  /** Whether `name` has a living avatar in the room right now (asleep counts: waking it up is what "Wake up" is for). */
  hasLivingAvatar(name: string): boolean {
    const spriteId = Object.hasOwn(this.avatars, name) ? this.avatars[name] : undefined;
    return spriteId !== undefined && this.sprites[spriteId] !== undefined;
  }

  counts(): RadarCounts {
    const playerIds = new Set(Object.values(this.avatars));
    let pilots = 0;
    let robots = 0;

    for (const [spriteId, sprite] of Object.entries(this.sprites)) {
      if (this.minimap.kindOf(sprite[0]) !== 'actor') continue;
      if (playerIds.has(spriteId)) pilots++;
      else robots++;
    }

    return { pilots, robots };
  }

  private draw(now: number): void {
    const planet = this.planet;
    let drawnPlanet: { x: number; y: number; radius: number } | undefined;
    if (planet) {
      const seconds = (now - this.planetReceivedAt) / 1000;
      drawnPlanet = { x: planet.x + planet.vx * seconds, y: planet.y + planet.vy * seconds, radius: planet.radius };
    }

    this.minimap.draw({
      sprites: this.sprites,
      avatarSpriteIds: new Set(Object.values(this.avatars)),
      localSpriteId: undefined,
      planet: drawnPlanet,
      positionOf: (spriteId) => ({ x: this.sprites[spriteId][1], y: this.sprites[spriteId][2] }),
      now,
    });
  }
}
