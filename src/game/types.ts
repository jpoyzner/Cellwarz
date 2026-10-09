import type { Lamp } from './lamps';
import type { Tv } from './tvs';

export type IncomingSprite = [number] | [number, number, number, Record<string, unknown>?];
export type StoredSprite = [number, number, number];

export type SpritesMap = Record<string, StoredSprite>;
export type AvatarsMap = Record<string, string>;

export type BackgroundKind = 'space' | 'station' | 'temple';

/** Mirrors server/planet.ts: world-pixel position, velocity per second, and a seed the look is derived from. */
export interface PlanetState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  seed: number;
}

export interface ConnectPayload {
  connect: string;
  sprites: SpritesMap;
  avatars: AvatarsMap;
  imagePaths: string[];
  background: BackgroundKind;
  worldWidth: number;
  worldHeight: number;
  lamps: Lamp[];
  tvs?: Tv[];
  /** Sprite the camera follows once a robot has turned the local player into a robot (they have no avatar then). */
  following?: number | null;
  planet?: PlanetState | null;
  score: number;
  diamonds?: number;
}
