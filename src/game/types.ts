import type { Lamp } from './lamps';

export type IncomingSprite = [number] | [number, number, number, Record<string, unknown>?];
export type StoredSprite = [number, number, number];

export type SpritesMap = Record<string, StoredSprite>;
export type AvatarsMap = Record<string, string>;
export type ToolsMap = Record<string, number>;

export type BackgroundKind = 'space' | 'station' | 'temple';

export interface ConnectPayload {
  connect: string;
  sprites: SpritesMap;
  avatars: AvatarsMap;
  tools: ToolsMap;
  imagePaths: string[];
  background: BackgroundKind;
  worldWidth: number;
  worldHeight: number;
  lamps: Lamp[];
  score: number;
}
