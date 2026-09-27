export class Force {
  constructor(
    private readonly xDirection: number,
    private readonly yDirection: number,
    private readonly mass: number,
  ) {}

  getXDirection(): number {
    return this.xDirection;
  }

  getYDirection(): number {
    return this.yDirection;
  }

  getMass(): number {
    return this.mass;
  }
}
