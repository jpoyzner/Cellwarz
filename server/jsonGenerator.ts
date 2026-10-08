import { Avatar } from './sprite/avatar';
import type { Sprite } from './sprite/sprite';

const DELETED_CODE = -1;
const AVATAR_NAME_KEY = '0';
const DASHBOARD_IMAGE_KEY = '1';
const CONSUME_SCALE_KEY = '2';
const TOOLS_DELETED_KEY = '-1';

export type JsonSprite = [number] | [number, number, number] | [number, number, number, Record<string, unknown>];

/**
 * A terse per-frame sprite list keyed by cell index: [imageIndex, xPixels, yPixels, extraInfo?].
 * `[-1]` means "deleted this frame". Kept compact intentionally — this is a hot path (48 FPS).
 */
export function getSprites(sprites: Sprite[], addExtraInfo: boolean, sessionAvatar: Avatar | undefined): Record<string, JsonSprite> {
  let extraToolsInfo: Record<string, number> | undefined;
  if (addExtraInfo && sessionAvatar?.needsStructureChangeUpdate()) {
    extraToolsInfo = getTools(sessionAvatar);
  }

  const jsonSprites: Record<string, JsonSprite> = {};

  for (const sprite of sprites) {
    let jsonSprite: JsonSprite;

    if (sprite.removed()) {
      jsonSprite = [DELETED_CODE];
    } else {
      let extraInfo: Record<string, unknown> | undefined;

      if (addExtraInfo && sprite instanceof Avatar) {
        if (sprite.showName()) {
          extraInfo = { [AVATAR_NAME_KEY]: sprite.getName() };
        }

        if (sprite === sessionAvatar && extraToolsInfo) {
          extraInfo = { ...(extraInfo ?? {}), [DASHBOARD_IMAGE_KEY]: extraToolsInfo };
        }
      }

      // A sprite being swallowed by a planet reports how far it has shrunk so clients can draw it smaller.
      const consumeScale = sprite.getConsumeScale();
      if (addExtraInfo && consumeScale !== undefined) {
        extraInfo = { ...(extraInfo ?? {}), [CONSUME_SCALE_KEY]: Math.round(consumeScale * 100) / 100 };
      }

      jsonSprite = extraInfo
        ? [sprite.getImageIndex(), sprite.getXPixels(), sprite.getYPixels(), extraInfo]
        : [sprite.getImageIndex(), sprite.getXPixels(), sprite.getYPixels()];
    }

    jsonSprites[String(sprite.getCellIndex())] = jsonSprite;
  }

  return jsonSprites;
}

export function getTools(avatar: Avatar): Record<string, number> {
  const tools: Record<string, number> = {};
  const structure = avatar.getStructure();

  if (!structure) {
    tools[TOOLS_DELETED_KEY] = DELETED_CODE;
  } else {
    const manas = structure.getManas();
    for (let i = 0; i < manas.length; i++) {
      tools[String(i)] = manas[i].getDashboardImageIndex();
    }
  }

  return tools;
}
