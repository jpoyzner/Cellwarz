import { ClusteredInitException, EdgeOfCellDataException } from './errors';
import type { Frame } from './frame';
import type { Sprite } from './sprite/sprite';
import type { World } from './world';

export class CellData {
  static readonly ANIMATION_STEP = 8;
  static readonly DEFAULT_IMAGE_DIR = 'images/';

  private readonly world: World;
  private readonly sprites: Sprite[] = [];
  private readonly imagePaths: string[] = [];
  private spriteCount = 0;

  private readonly map: (Set<Sprite> | undefined)[][];

  constructor(
    cellWidth: number,
    cellHeight: number,
    world: World,
    private readonly wrapsAtEdges = false,
  ) {
    this.world = world;
    this.map = Array.from({ length: cellWidth }, () => new Array<Set<Sprite> | undefined>(cellHeight));
  }

  add(sprite: Sprite, cellInit: boolean): number {
    if (cellInit && this.world.getPhysics().getSpritesAtSamePosition(sprite).size > 0) {
      throw new ClusteredInitException();
    }

    this.sprites.push(sprite);

    try {
      this.writeDataForSprite(sprite, true);
      this.applyClipping(sprite);
      return this.spriteCount++;
    } catch (e) {
      if (e instanceof EdgeOfCellDataException) {
        const index = this.sprites.indexOf(sprite);
        if (index !== -1) this.sprites.splice(index, 1);
        return -1;
      }
      throw e;
    }
  }

  remove(sprite: Sprite): void {
    const index = this.sprites.indexOf(sprite);
    if (index !== -1) this.sprites.splice(index, 1);

    try {
      this.writeDataForSprite(sprite, false);
    } catch (e) {
      if (!(e instanceof EdgeOfCellDataException)) throw e;
    }
  }

  move(sprite: Sprite, xDirection: number, yDirection: number): void {
    try {
      this.writeDataForSprite(sprite, false);
      const x = sprite.getX() + xDirection;
      const y = sprite.getY() + yDirection;
      if (this.wrapsAtEdges) {
        sprite.setX(this.wrapPosition(x, this.map.length, sprite.getWidth()));
        sprite.setY(this.wrapPosition(y, this.map[0].length, sprite.getHeight()));
      } else {
        sprite.changeXBy(xDirection);
        sprite.changeYBy(yDirection);
      }
      this.writeDataForSprite(sprite, true);
      this.applyClipping(sprite);
      sprite.needsRedraw(true);
    } catch (e) {
      if (e instanceof EdgeOfCellDataException) {
        sprite.removePermanently();
      } else {
        throw e;
      }
    }
  }

  moveTo(sprite: Sprite, x: number, y: number): void {
    try {
      this.writeDataForSprite(sprite, false);
      sprite.setX(this.wrapsAtEdges ? this.wrapPosition(x, this.map.length, sprite.getWidth()) : x);
      sprite.setY(this.wrapsAtEdges ? this.wrapPosition(y, this.map[0].length, sprite.getHeight()) : y);
      this.writeDataForSprite(sprite, true);
      this.applyClipping(sprite);
      sprite.needsRedraw(true);
    } catch (e) {
      if (e instanceof EdgeOfCellDataException) {
        sprite.removePermanently();
      } else {
        throw e;
      }
    }
  }

  private applyClipping(sprite: Sprite): void {
    sprite.setClippedX(sprite.getX());
    sprite.setClippedY(sprite.getY());
    sprite.setClippedWidth(sprite.getWidth());
    sprite.setClippedHeight(sprite.getHeight());

    const currentFrame: Frame = sprite.getCurrentFrame();
    this.adjustClipping(
      sprite,
      -currentFrame.getTopClip(),
      -currentFrame.getRightClip(),
      -currentFrame.getBottomClip(),
      -currentFrame.getLeftClip(),
    );
  }

  private writeDataForSprite(sprite: Sprite, save: boolean): void {
    this.writeData(sprite, sprite.getX(), sprite.getY(), sprite.getWidth(), sprite.getHeight(), save);
  }

  adjustClipping(sprite: Sprite, topAdjustment: number, rightAdjustment: number, bottomAdjustment: number, leftAdjustment: number): void {
    if (topAdjustment < 0 || bottomAdjustment < 0) {
      if (topAdjustment < 0) {
        this.writeData(sprite, sprite.getX(), sprite.getY(), sprite.getWidth(), -topAdjustment, false);
        sprite.setClippedY(sprite.getY() - topAdjustment);
      }

      if (bottomAdjustment < 0) {
        this.writeData(sprite, sprite.getX(), sprite.getY() + sprite.getHeight() + bottomAdjustment - 1, sprite.getWidth(), -bottomAdjustment, false);
      }

      sprite.setClippedHeight(sprite.getHeight() + topAdjustment + bottomAdjustment);
    }

    if (leftAdjustment < 0 || rightAdjustment < 0) {
      if (leftAdjustment < 0) {
        this.writeData(sprite, sprite.getX(), sprite.getY(), -leftAdjustment, sprite.getHeight(), false);
        sprite.setClippedX(sprite.getX() - leftAdjustment);
      }

      if (rightAdjustment < 0) {
        this.writeData(sprite, sprite.getX() + sprite.getWidth() + rightAdjustment - 1, sprite.getY(), -rightAdjustment, sprite.getHeight(), false);
      }

      sprite.setClippedWidth(sprite.getWidth() + leftAdjustment + rightAdjustment);
    }
  }

  private writeData(sprite: Sprite, x: number, y: number, width: number, height: number, save: boolean): void {
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        let spritesAtPosition = this.getMapPosition(x + i, y + j);

        if (save) {
          if (spritesAtPosition === undefined) {
            spritesAtPosition = new Set<Sprite>();
            this.map[x + i][y + j] = spritesAtPosition;
          }
          spritesAtPosition.add(sprite);
        } else {
          spritesAtPosition?.delete(sprite);
        }
      }
    }
  }

  addImage(path: string): number {
    const fullPath = CellData.DEFAULT_IMAGE_DIR + path + '.png';

    const existingIndex = this.imagePaths.indexOf(fullPath);
    if (existingIndex !== -1) {
      return existingIndex;
    }

    this.imagePaths.push(fullPath);
    return this.imagePaths.length - 1;
  }

  getSprites(): Sprite[] {
    return [...this.sprites];
  }

  getMapPosition(x: number, y: number): Set<Sprite> | undefined {
    if (x < 0 || x >= this.map.length) {
      throw new EdgeOfCellDataException();
    }

    const column = this.map[x];
    if (y < 0 || y >= column.length) {
      throw new EdgeOfCellDataException();
    }

    return column[y];
  }

  getWidth(): number {
    return this.map.length;
  }

  getHeight(): number {
    return this.map[0]?.length ?? 0;
  }

  getImagePaths(): string[] {
    return this.imagePaths;
  }

  private wrapPosition(position: number, dimension: number, spriteSize: number): number {
    const validPositions = dimension - spriteSize + 1;
    return ((position % validPositions) + validPositions) % validPositions;
  }
}
