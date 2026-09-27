export type IncomingSprite = [number] | [number, number, number, Record<string, unknown>?];
export type StoredSprite = [number, number, number];

export type SpritesMap = Record<string, StoredSprite>;
export type AvatarsMap = Record<string, string>;
export type ToolsMap = Record<string, number>;

export interface ConnectPayload {
  connect: string;
  sprites: SpritesMap;
  avatars: AvatarsMap;
  tools: ToolsMap;
  imagePaths: string[];
}
