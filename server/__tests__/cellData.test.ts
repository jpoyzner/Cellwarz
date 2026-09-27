import { describe, expect, it } from 'vitest';
import { EdgeOfCellDataException } from '../errors';
import { createTestCell } from './testHelpers';

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
});
