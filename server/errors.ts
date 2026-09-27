export class ClusteredInitException extends Error {
  constructor() {
    super('Sprite init position is clustered/occupied');
    this.name = 'ClusteredInitException';
  }
}

export class EdgeOfCellDataException extends Error {
  constructor() {
    super('Position is outside the cell data bounds');
    this.name = 'EdgeOfCellDataException';
  }
}
