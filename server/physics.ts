import { EdgeOfCellDataException } from './errors';
import type { Sprite } from './sprite/sprite';

export class Physics {
  static readonly UP = -1;
  static readonly RIGHT = 1;
  static readonly DOWN = 1;
  static readonly LEFT = -1;
  static readonly NONE = 0;

  static readonly EFFECTS_LAYER = 0;
  static readonly LEVEL_LAYER = 1;
  static readonly OBJECT_LAYER = 2;
  static readonly BACKGROUND_LAYER = 3;

  private static readonly GRAVITY_ACCELERATION_INTERVAL = 5;
  static readonly FALL_DISTANCE = 2;

  gravitate(sprite: Sprite): boolean {
    if (sprite.getMass() === 0) {
      return false;
    }

    const fell = this.move(
      sprite,
      Physics.NONE,
      Physics.DOWN,
      Physics.FALL_DISTANCE + Math.floor(sprite.getGravitateCount() / Physics.GRAVITY_ACCELERATION_INTERVAL),
    );

    if (fell) {
      sprite.addGravitateCount();
    } else {
      sprite.resetGravitateCount();
    }

    return fell;
  }

  /** Basic move; push defaults true (matches the Java public 4-arg overload). */
  move(sprite: Sprite, xDirection: number, yDirection: number, distance: number, push = true): boolean {
    for (let i = 0; i < distance; i++) {
      if (this.touchSprite(sprite, xDirection, yDirection, push)) {
        return false;
      }

      let spritesOnTop: Set<Sprite> | undefined;
      const falling = push && yDirection === Physics.DOWN;

      if (falling) {
        spritesOnTop = this.getSpritesAbove(sprite, xDirection, 0);
      }

      sprite.getCellData().move(sprite, xDirection, yDirection);

      if (falling && spritesOnTop) {
        for (const spriteOnTop of spritesOnTop) {
          if (!spriteOnTop.isStable()) {
            this.move(spriteOnTop, Physics.NONE, Physics.DOWN, 1);
          }
        }
      }
    }

    return true;
  }

  /** Checks if touching or close to touching, without pushing. */
  reachSprite(sprite: Sprite, xDirection: number, yDirection: number, totalReach: number): boolean {
    for (let i = 0; i < totalReach; i++) {
      if (this.touchSpriteWithReach(sprite, xDirection, yDirection, i, false)) {
        return true;
      }
    }

    return false;
  }

  touchSprite(sprite: Sprite, xDirection: number, yDirection: number, push: boolean): boolean {
    return this.touchSpriteWithReach(sprite, xDirection, yDirection, Physics.NONE, push);
  }

  /** Main algorithm for checking if touching or close; also pushes other sprites as necessary. */
  private touchSpriteWithReach(sprite: Sprite, xDirection: number, yDirection: number, extraReach: number, push: boolean): boolean {
    const pushedSprites = new Set<Sprite>();
    const spritesOnTop = this.getSpritesAbove(sprite, xDirection, extraReach);

    if (yDirection === Physics.UP || yDirection === Physics.DOWN) {
      const spritesAtSide = yDirection === Physics.UP ? spritesOnTop : this.getSpritesUnder(sprite, xDirection, extraReach);
      for (const spriteAtPosition of spritesAtSide) {
        if (this.canInteract(sprite, spriteAtPosition)) {
          if (!push || sprite.getMass() < spriteAtPosition.getMass()) {
            return true;
          }
          pushedSprites.add(spriteAtPosition);
        }
      }
    }

    if (xDirection === Physics.LEFT || xDirection === Physics.RIGHT) {
      for (let row = 0; row < sprite.getClippedHeight(); row++) {
        try {
          const spritesAtPosition = sprite
            .getCellData()
            .getMapPosition(
              sprite.getClippedX() + (xDirection === Physics.LEFT ? Physics.LEFT - extraReach : sprite.getClippedWidth() + extraReach),
              sprite.getClippedY() + yDirection + row,
            );

          if (spritesAtPosition && spritesAtPosition.size > 0) {
            for (const spriteAtPosition of spritesAtPosition) {
              if (this.canInteract(sprite, spriteAtPosition)) {
                if (!push || sprite.getMass() < spriteAtPosition.getMass()) {
                  return true;
                }
                pushedSprites.add(spriteAtPosition);
              }
            }
          }
        } catch (e) {
          if (!(e instanceof EdgeOfCellDataException)) throw e;
        }
      }

      if (push && !sprite.isEffect()) {
        for (const spriteOnTop of spritesOnTop) {
          if (!spriteOnTop.isStable()) {
            this.move(spriteOnTop, xDirection, Physics.NONE, 1);
          }
        }
      }
    }

    for (const pushedSprite of pushedSprites) {
      if (!this.move(pushedSprite, xDirection, yDirection, 1, false)) {
        return true;
      }
    }

    return false;
  }

  getSpritesAbove(sprite: Sprite, xDirection: number, extraReach: number): Set<Sprite> {
    const spritesOnTop = new Set<Sprite>();

    try {
      for (let column = 0; column < sprite.getClippedWidth(); column++) {
        const spritesAtPosition = sprite
          .getCellData()
          .getMapPosition(sprite.getClippedX() + xDirection + column, sprite.getClippedY() - 1 - extraReach);

        if (spritesAtPosition && spritesAtPosition.size > 0) {
          for (const s of spritesAtPosition) spritesOnTop.add(s);
        }
      }
    } catch (e) {
      if (!(e instanceof EdgeOfCellDataException)) throw e;
    }

    return spritesOnTop;
  }

  getSpritesUnder(sprite: Sprite, xDirection: number, extraReach: number): Set<Sprite> {
    const spritesUnder = new Set<Sprite>();

    try {
      for (let column = 0; column < sprite.getClippedWidth(); column++) {
        const spritesAtPosition = sprite
          .getCellData()
          .getMapPosition(sprite.getClippedX() + xDirection + column, sprite.getClippedY() + sprite.getClippedHeight() + extraReach);

        if (spritesAtPosition && spritesAtPosition.size > 0) {
          for (const s of spritesAtPosition) spritesUnder.add(s);
        }
      }
    } catch (e) {
      if (!(e instanceof EdgeOfCellDataException)) throw e;
    }

    return spritesUnder;
  }

  moveTo(sprite: Sprite, x: number, y: number): void {
    sprite.getCellData().moveTo(sprite, x, y);
  }

  getSpritesAtSamePosition(sprite: Sprite): Set<Sprite> {
    const sprites = new Set<Sprite>();

    for (let column = sprite.getClippedX(); column < sprite.getClippedWidth() + sprite.getClippedX(); column++) {
      for (let row = sprite.getClippedY(); row < sprite.getClippedHeight() + sprite.getClippedY(); row++) {
        try {
          const spritesAtPosition = sprite.getCellData().getMapPosition(column, row);
          if (spritesAtPosition) {
            for (const s of spritesAtPosition) sprites.add(s);
          }
        } catch (e) {
          if (!(e instanceof EdgeOfCellDataException)) throw e;
        }
      }
    }

    return sprites;
  }

  private canInteract(sourceSprite: Sprite, targetSprite: Sprite): boolean {
    return (
      targetSprite !== sourceSprite &&
      targetSprite.getLayer() <= sourceSprite.getLayer() &&
      !(targetSprite.melts() && sourceSprite.melts())
    );
  }
}
