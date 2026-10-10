import { Avatar } from './sprite/avatar';
import type { Sprite } from './sprite/sprite';

const DELETED_CODE = -1;
const AVATAR_NAME_KEY = '0';
const CONSUME_SCALE_KEY = '2';
const SLEEPING_KEY = '3';

export type JsonSprite = [number] | [number, number, number] | [number, number, number, Record<string, unknown>];

/**
 * A terse per-frame sprite list keyed by cell index: [imageIndex, xPixels, yPixels, extraInfo?].
 * `[-1]` means "deleted this frame". Kept compact intentionally — this is a hot path (48 FPS).
 */
export function getSprites(sprites: Sprite[], addExtraInfo: boolean): Record<string, JsonSprite> {
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
      }

      // Sleeping is sent in full-state payloads too (not just redraws) so a client joining mid-nap sees the Zs at once.
      if (sprite instanceof Avatar && sprite.isSleeping()) {
        extraInfo = { ...(extraInfo ?? {}), [SLEEPING_KEY]: 1 };
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
