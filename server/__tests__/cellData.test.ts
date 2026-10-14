import { describe, expect, it } from 'vitest';
import { EdgeOfCellDataException } from '../errors';
import { Physics } from '../physics';
import { createTestCell, PlainBlock } from './testHelpers';

function createCellData(width: number, height: number) {
  return createTestCell(width, height).cellData;
}

describe('CellData', () => {
  it('dedupes image paths and returns stable indices', () => {
    const cellData = createCellData(10, 10);

    const first = cellData.addImage('me/stand');
    const second = cellData.addImage('me/run');
    const firstAgain = cellData.addImage('me/stand');

    expect(first).toBe(0);
    expect(second).toBe(1);
    expect(firstAgain).toBe(0);
    expect(cellData.getImagePaths()).toEqual(['images/me/stand.png', 'images/me/run.png']);
  });

  it('throws EdgeOfCellDataException outside the grid bounds', () => {
    const cellData = createCellData(5, 5);

    expect(() => cellData.getMapPosition(-1, 0)).toThrow(EdgeOfCellDataException);
    expect(() => cellData.getMapPosition(0, 5)).toThrow(EdgeOfCellDataException);
    expect(cellData.getMapPosition(0, 0)).toBeUndefined();
  });

  describe('a deleted sprite', () => {
    function deletedBlock() {
      const { cell, cellData, physics } = createTestCell(40, 40);
      PlainBlock.init(cellData);
      const block = new PlainBlock(10, 10, false, cell);
      block.removePermanently();
      block.delete();
      return { cell, cellData, physics, block };
    }

    it('is not put back into the grid when something still moves it', () => {
      const { cellData, block } = deletedBlock();

      cellData.move(block, 1, 0);
      cellData.moveTo(block, 20, 20);

      expect(cellData.getMapPosition(10, 10)?.has(block) ?? false).toBe(false);
      expect(cellData.getMapPosition(20, 20)?.has(block) ?? false).toBe(false);
      expect(cellData.getMapPosition(11, 10)?.has(block) ?? false).toBe(false);
      expect(cellData.getSprites()).not.toContain(block);
    });

    it('leaves no invisible block behind when its stuck-together mate moves the group', () => {
      const { cell, cellData, physics, block } = deletedBlock();
      const mate = new PlainBlock(20, 10, false, cell);
      mate.bondWith(block);

      physics.move(mate, Physics.RIGHT, Physics.NONE, 3);

      const occupied = [];
      for (let x = 0; x < 40; x++) {
        for (let y = 0; y < 40; y++) {
          for (const sprite of cellData.getMapPosition(x, y) ?? []) if (sprite === block) occupied.push([x, y]);
        }
      }
      expect(occupied).toEqual([]);
    });
  });
});
